import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { StoryBeat } from '~/engine/story'
import { MODEL } from './generate'

/** Structured-output schema for the reply; every object must list all keys and forbid extras. */
const LAYOUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    theme: {
      type: 'string',
      description: 'The through-line in one short paragraph: audience, tone, palette, the core message',
    },
    beats: {
      type: 'array',
      description: 'The beats in order; each becomes a rest frame the viewer scrolls to',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'A short beat title' },
          description: { type: 'string', description: 'What the viewer sees and understands at this beat' },
          transition: {
            type: 'string',
            description: 'How the scene moves into the next beat, or empty to leave it open. Empty on the last beat.',
          },
        },
        required: ['title', 'description', 'transition'],
      },
    },
  },
  required: ['theme', 'beats'],
}

const layoutSchema = z.object({
  theme: z.string().trim(),
  beats: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'every beat needs a title'),
        description: z.string().trim(),
        transition: z.string().trim().default(''),
      }),
    )
    .min(1, 'the story needs at least one beat'),
})

const SYSTEM_PROMPT = `You lay out scroll-driven presentations as stories. Given a designer's description, return its story layout: a theme paragraph, then the beats in order.
- A beat is one rest frame the viewer scrolls to. Most presentations need 4–8.
- Each beat's description says what the viewer should see and understand there, in one to three plain sentences.
- Keep the designer's facts, wording and order wherever they gave them; fill gaps in the spirit of the description. Don't invent figures, names or claims.
- Describe a transition only where the description implies one (e.g. "the chart grows into the next slide"); otherwise leave it empty. The last beat has no transition.`

export type StoryLayout = { theme: string; beats: StoryBeat[] }

/** Checks the model's layout and shapes it into story beats; null if it isn't usable. */
export function parseLayout(input: unknown): StoryLayout | null {
  const parsed = layoutSchema.safeParse(input)
  if (!parsed.success) return null
  const { theme, beats } = parsed.data
  return {
    theme,
    beats: beats.map((beat, i) => ({ ...beat, id: '', transition: i < beats.length - 1 ? beat.transition : '' })),
  }
}

/** Turns a prose description into a theme and beats, for the designer to edit before generating. */
export async function layoutStory(title: string, description: string): Promise<StoryLayout> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('No Anthropic API key is set. Add one in Settings.')

  const response = await new Anthropic().messages.create({
    model: MODEL,
    max_tokens: 8_000,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: LAYOUT_JSON_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Title: ${title.trim() || '(untitled)'}\n\n<description>\n${description.trim()}\n</description>`,
      },
    ],
  })

  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  const layout = parseLayout(safeJson(text))
  if (!layout) {
    throw new Error(
      response.stop_reason === 'max_tokens'
        ? 'The layout ran too long. Try a shorter description.'
        : 'Choreo didn’t get a usable layout back. Try again or add more detail.',
    )
  }
  return layout
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
