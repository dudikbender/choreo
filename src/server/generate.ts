import Anthropic from '@anthropic-ai/sdk'
import type {
  ContentBlock,
  MessageParam,
  Tool,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages'
import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { describeAsset, extensionOf, formatAssets, formatBytes, isRemote } from '~/engine/assets'
import type { AssetEntry } from '~/engine/assets'
import { HISTORY_CONTEXT_LIMIT, formatHistory } from '~/engine/history'
import { presentationSchema } from '~/engine/schema'
import { diffStories, parseStory, serializeStory, storySchema } from '~/engine/story'
import { layoutPhases, poseAt, resolveKeyframes } from '~/engine/timeline'
import { formatVariables } from '~/engine/variables'
import { reviewLayout } from './review'
import {
  COMPONENT_PATH,
  CONFIG_PATH,
  ID_PATTERN,
  STORY_PATH,
  isEditablePath,
  validateComponentSource,
  validateFolder,
} from './validate'
import { listAssetEntries, readAssetFile } from './assets'
import { presentationExists, readEditableFiles, readHistory } from './workspace'
import type { FileChange } from './workspace'

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'
const MAX_TURNS = 40
const MAX_FIX_ROUNDS = 3
/** Opus 5.5 allows 128k output; thinking tokens count against this. */
const MAX_OUTPUT_TOKENS = 128_000

const storyRequestSchema = z.object({
  mode: z.enum(['create', 'modify']),
  id: z.string().regex(ID_PATTERN),
  story: storySchema.refine((story) => story.beats.length > 0, 'the story needs at least one beat'),
  /** Free-form direction that isn't tied to a single beat. */
  notes: z.string().trim().default(''),
})

/** An instruction scoped to one component, e.g. from right-clicking it in present mode. */
const componentRequestSchema = z.object({
  mode: z.literal('component'),
  id: z.string().regex(ID_PATTERN),
  component: z.string().regex(ID_PATTERN),
  /** Phase id the designer was looking at when they asked. */
  beat: z.string().optional(),
  instruction: z.string().trim().min(1),
})

export const generateRequestSchema = z.union([storyRequestSchema, componentRequestSchema])
export type GenerateRequest = z.infer<typeof generateRequestSchema>
export type StoryRequest = z.infer<typeof storyRequestSchema>
export type ComponentRequest = z.infer<typeof componentRequestSchema>

export type TokenUsage = {
  input: number
  output: number
  thinking: number
  cacheRead: number
}

export type GenerateEvent =
  | { type: 'status'; message: string }
  | { type: 'note'; message: string }
  | { type: 'done'; summary: string; changes: FileChange[]; warnings: string[]; usage: TokenUsage }
  | { type: 'error'; message: string }

const tools: Tool[] = [
  {
    name: 'list_files',
    description:
      'Lists the files in this presentation folder: story.md, presentation.json, components/*.tsx and assets/*.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'review_story',
    description:
      'Reviews the entire story layout against the choreography: story.md, then for every beat its phase range, what is on stage at its rest frame, what animates, what enters/exits into the next beat, the transition the story asks for, and any beat/phase mismatches or unsettled components.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'set_transition',
    description:
      'Records in story.md the transition from one beat into the next — use it for transitions the story left open, once you have choreographed them. One or two plain-language sentences.',
    input_schema: {
      type: 'object',
      properties: {
        beat: { type: 'string', description: 'Id of the beat the transition starts from (not the last beat)' },
        text: { type: 'string', description: 'How the scene moves into the next beat' },
      },
      required: ['beat', 'text'],
    },
  },
  {
    name: 'view_asset',
    description:
      'Shows you an image from assets/ (png, jpg, gif, webp, or svg source) so you can see what it depicts before using it.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'assets/<file>' } },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description: 'Reads story.md, presentation.json or a components/<name>.tsx file.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'str_replace',
    description:
      'Surgical edit of an existing file. Replaces one unique occurrence of old_string with new_string. Use this for almost every modification — never rewrite a whole file to change a few lines.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'story.md, presentation.json or components/<name>.tsx',
        },
        old_string: { type: 'string', description: 'Exact text to find; must match once unless replace_all' },
        new_string: { type: 'string', description: 'Replacement text' },
        replace_all: {
          type: 'boolean',
          description: 'Replace every occurrence. Default false.',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'write_component',
    description:
      'Creates a NEW components/<name>.tsx, or replaces one only when the change is too large for str_replace. Prefer str_replace on existing files.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'kebab-case file name without extension' },
        source: { type: 'string', description: 'Full TSX source of the component' },
      },
      required: ['name', 'source'],
    },
  },
  {
    name: 'delete_component',
    description: 'Deletes components/<name>.tsx. Also remove it from presentation.json via str_replace or write_config.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'write_config',
    description:
      'Creates or fully replaces presentation.json. For small edits (a label, one keyframe, a duration) use str_replace on presentation.json instead.',
    input_schema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description:
            'Complete presentation.json: version 1, meta {title, aspectRatio, backgroundColor?}, phases [{id,label,duration}], stops? [{at}], variables? {name: text}, components [{id,file,keyframes:[{at,...}]}]. Existing stops and variables are kept if you omit them.',
        },
      },
      required: ['config'],
    },
  },
]

const SYSTEM_PROMPT = `You author scroll-driven presentations that tell stories. A presentation is a folder containing story.md (the narrative layout), presentation.json (the choreography) and React components in components/*.tsx. You edit it only through the provided tools.

## The story layout (story.md)
- story.md is written by the designer: a "# Title", a theme paragraph (the through-line: audience, tone, palette, the core message), then one "## Beat title" section per story beat, in order.
- Each beat has a "<!-- phase: <id> -->" marker and maps one-to-one, in the same order, to the phase with that id in presentation.json. The phase label is the beat title. Never add, drop or reorder phases without doing the same to the beats, and vice versa.
- A beat's text says what the viewer should see and understand at that beat's rest frame (its phase start). An empty beat means "keep what's there" when modifying, or "you decide, guided by the title and theme" when creating.
- A "### Transition" section under a beat describes how the scene moves from that beat into the next one. Choreograph it in the scroll between the two rest frames — the latter part of the earlier phase, settling by the next phase's start. Transitions are where the story is told: carry elements across beats, transform them, or hand off focus instead of simply fading everything out and in.
- A beat with no Transition section leaves it to you. Design one that serves the theme, then record it with set_transition in one or two plain sentences. Only use set_transition for transitions the story left open.
- Only edit beat titles or text in story.md (via str_replace) when the designer's direction requires a structural change, e.g. "add a closing beat". Keep it in the same format.
- Use review_story to see the whole layout at once. Call it before modifying an existing presentation and once more before your final summary.

## Change history
- A modification may start with a <history> of recent changes: what the designer asked, what you proposed, whether they applied or discarded it, and any lines they hand-edited in your code. Use it to understand follow-ups ("bigger again", "undo the last change", "like you did for the title").
- The files are the truth; history can be out of date. Never re-apply an old change from memory: read the current file.
- Hand edits show the designer's taste: keep them, and follow their lead elsewhere. Don't re-propose a discarded idea unless asked.

## How the engine renders
- The stage is 1920px wide (height from meta.aspectRatio; 1080px for 16:9) with CSS perspective of 1600px.
- Stage + letterbox background comes from meta.backgroundColor (CSS color string; default "#171717"). Change the background by editing that field — do NOT invent a full-screen backdrop component.
- Every component is rendered centered on the stage. Its keyframes move it relative to that center: x/y in px (positive y is down), z in px (negative is farther away), rotateX/rotateY/rotateZ in degrees, scale, opacity 0..1.
- The whole presentation is one scroll track. 1 unit = 1px scrolled. Phases lay out end to end; a phase's start offset is the sum of the earlier phases' durations. Typical durations: 800–2000.
- Keyframe \`at\` values are absolute offsets on that track, not phase-relative. They must be strictly increasing per component. A property left out of a keyframe carries over from the previous keyframe (the first keyframe defaults to x/y/z/rotate 0, scale 1, opacity 1). A component holds its first keyframe's pose before it, and its last keyframe's pose after it.
- Components move independently: put waypoints wherever each one needs them, not at phase boundaries.
- HARD RULE: at every phase's start offset, every component must be at rest — no component may have one keyframe before a phase start and its next keyframe after it with different values. Finish arrivals at or before the phase start; start departures at or after it. Phase starts are the default stop points.
- Stop points are the offsets the arrow keys snap to and PDF export captures. An optional top-level "stops": [{ "at": <offset> }] in presentation.json holds stops the designer placed by hand; it replaces phase starts as the stop points. Never add or remove stops on your own. If you change phase durations or move choreography, shift existing stops so each still lands on the same moment of the story, kept sorted and within the track. Treat each hand-placed stop as a frame the designer wants to see: don't leave things mid-flight there unless asked.
- Components that should be invisible during a stretch need opacity 0 (and usually an off-stage or far-z position).

## Authoring contract for components/*.tsx
- \`export default function Name({ style }: { style: CSSProperties })\` and put \`style={style}\` on the root element. Never set transform/opacity on the root yourself.
- Style with Tailwind CSS v4 utility classes only. Size for a 1920px-wide stage: headings text-7xl to text-[10rem], body text-3xl+.
- Only import from "react" (types and hooks) or "../assets/<file>" for files that list_files shows. No other packages; use inline SVG for icons and charts.
- Never read scroll position, window size, or use timers to animate — motion comes only from keyframes.
- Self-contained: never import sibling components.

## Variables
- presentation.json may hold "variables": { "<camelCaseName>": "<text>" } — values the designer reuses across components, like a client's name or a tagline. They're listed in <variables>.
- Every component also receives a \`vars\` prop with them. To use one, take it in the signature — \`({ style, vars }: { style: CSSProperties; vars: Record<string, string> })\` — and write \`{vars.clientName}\` wherever its text belongs, including attributes like alt or title.
- When a variable holds the text you would show, always use the variable instead of typing its value, so the designer can change it in one place.
- Create a variable only when the designer asks for one, or when they ask for a value to be easy to swap (a client name, a date, a price). Name it in camelCase and add it to "variables" with str_replace on presentation.json. Never rename or remove a variable unless asked; components that use it would show nothing.

## Assets
- The designer can add media to a presentation. They're listed in <assets> (and by list_files) with kind, size and the designer's description. Use them when the story or instruction calls for them, or when one clearly fits a beat; don't force every asset in.
- image: \`import teamPhoto from '../assets/team.jpg'\` then \`<img src={teamPhoto} alt="…" className="…" />\`. Keep its aspect ratio (dimensions are listed); use object-cover inside a sized box to crop. Call view_asset to see an image before placing or describing it.
- video: \`import clip from '../assets/clip.mp4'\` then \`<video src={clip} autoPlay muted loop playsInline className="…" />\` — always muted for autoplay.
- audio: only when the designer asks; use \`<audio src={…} controls />\`.
- data (.json): \`import data from '../assets/data.json'\` gives the parsed value; chart it with inline SVG.
- embed (YouTube/Vimeo/Loom): \`<iframe src="<the listed url>" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="aspect-video w-[1280px] rounded-2xl border-0" />\`. Add ?autoplay=1&mute=1 only if the designer wants it to play on its own.
- link: a web page. Show it as a styled link, a call-to-action, or a caption with the address; don't iframe it (most sites refuse to be framed).
- Use asset file names and URLs exactly as listed.

## Workflow
- New presentation: write_component for each new file, then write_config with "version": 1 and one phase per story beat (id = the beat's phase id). Ids are kebab-case; each component's file is "components/<id>.tsx".
- Modifying: review_story, read only the files you will change, then str_replace. Do not call write_component or write_config on a file that already exists unless you are adding a new component or restructuring the whole config.
- Never rewrite an unchanged file. Never dump a full file as a tool argument when a few-line str_replace would do.
- Create one coherent visual design that follows the theme, and make every beat and transition read as part of a single story.
- When finished, reply with a 2–4 sentence plain-text summary (no Markdown) for the user of what you made or changed. Don't ask questions; make reasonable choices.`

export class Workspace {
  private staged = new Map<string, string | null>()

  constructor(
    private base: Record<string, string>,
    private assets: AssetEntry[],
  ) {}

  assetList(): AssetEntry[] {
    return this.assets
  }

  asset(path: string): AssetEntry | undefined {
    return this.assets.find((a) => !isRemote(a) && `assets/${a.name}` === path.replace(/^\.\.\//, ''))
  }

  get(path: string): string | undefined {
    if (this.staged.has(path)) return this.staged.get(path) ?? undefined
    return this.base[path]
  }

  set(path: string, contents: string | null) {
    this.staged.set(path, contents)
  }

  files(): Record<string, string> {
    const merged = { ...this.base }
    for (const [path, contents] of this.staged) {
      if (contents === null) delete merged[path]
      else merged[path] = contents
    }
    return merged
  }

  listing(): string {
    const files = Object.keys(this.files()).sort()
    const assets = this.assets.map(describeAsset)
    return [...files, ...assets].join('\n') || '(empty folder)'
  }

  changes(): FileChange[] {
    const result: FileChange[] = []
    for (const [path, after] of this.staged) {
      const before = this.base[path] ?? null
      if (before !== after) result.push({ path, before, after })
    }
    return result.sort((a, b) => a.path.localeCompare(b.path))
  }
}

type ToolOutcome = { content: ToolResultBlockParam['content']; isError?: boolean; status?: string }

const VIEWABLE_IMAGES: Record<string, 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}
/** The API's per-image limit. */
const MAX_VIEW_BYTES = 5 * 1024 * 1024

export async function viewAsset(ws: Workspace, id: string, input: Record<string, unknown>): Promise<ToolOutcome> {
  const requested = String(input.path ?? '')
  const asset = ws.asset(requested)
  if (!asset) return { content: `${requested} is not an asset file. Assets: see list_files.`, isError: true }
  const file = await readAssetFile(id, asset.name)
  if (!file) return { content: `assets/${asset.name} is missing on disk`, isError: true }
  const ext = extensionOf(asset.name)

  if (ext === 'svg') {
    const source = await readFile(file.path, 'utf8')
    return { content: `SVG source of assets/${asset.name}:\n${source.slice(0, 20_000)}`, status: `Looking at assets/${asset.name}` }
  }
  const mediaType = VIEWABLE_IMAGES[ext]
  if (!mediaType) return { content: `assets/${asset.name} is a ${asset.kind}; only images can be viewed`, isError: true }
  if (file.size > MAX_VIEW_BYTES) {
    return { content: `assets/${asset.name} is too large to view (${formatBytes(file.size)}); rely on its description`, isError: true }
  }
  const data = (await readFile(file.path)).toString('base64')
  return {
    content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
      { type: 'text', text: describeAsset(asset) },
    ],
    status: `Looking at assets/${asset.name}`,
  }
}

export function runTool(ws: Workspace, name: string, input: Record<string, unknown>): ToolOutcome {
  switch (name) {
    case 'list_files':
      return { content: ws.listing() }

    case 'review_story':
      return { content: reviewLayout(ws.files()), status: 'Reviewing the story layout' }

    case 'set_transition': {
      const raw = ws.get(STORY_PATH)
      if (raw === undefined) return { content: `${STORY_PATH} does not exist`, isError: true }
      const story = parseStory(raw)
      const beatId = String(input.beat ?? '')
      const text = String(input.text ?? '').trim()
      const index = story.beats.findIndex((beat) => beat.id === beatId)
      if (index === -1) {
        return {
          content: `No beat "${beatId}". Beats: ${story.beats.map((b) => b.id).join(', ')}`,
          isError: true,
        }
      }
      if (index === story.beats.length - 1) {
        return { content: `"${beatId}" is the last beat; there is no next beat to transition into`, isError: true }
      }
      if (!text) return { content: 'text must not be empty', isError: true }
      story.beats[index] = { ...story.beats[index], transition: text }
      ws.set(STORY_PATH, serializeStory(story))
      return {
        content: `Recorded transition ${beatId} → ${story.beats[index + 1].id}`,
        status: `Recording transition ${beatId} → ${story.beats[index + 1].id}`,
      }
    }

    case 'read_file': {
      const path = String(input.path ?? '')
      const contents = ws.get(path)
      if (contents === undefined) return { content: `${path} does not exist`, isError: true }
      return { content: contents, status: `Reading ${path}` }
    }

    case 'str_replace':
      return applyStrReplace(ws, input)

    case 'write_component': {
      const fileName = String(input.name ?? '').replace(/\.tsx$/, '')
      if (!ID_PATTERN.test(fileName)) {
        return { content: `"${fileName}" is not a kebab-case name`, isError: true }
      }
      const path = `components/${fileName}.tsx`
      const source = String(input.source ?? '')
      const errors = validateComponentSource(source)
      if (errors.length > 0) {
        return { content: `Not written. Fix these and retry:\n${errors.join('\n')}`, isError: true }
      }
      ws.set(path, source)
      return { content: `Wrote ${path}`, status: `Writing ${path}` }
    }

    case 'delete_component': {
      const path = `components/${String(input.name ?? '').replace(/\.tsx$/, '')}.tsx`
      if (ws.get(path) === undefined) return { content: `${path} does not exist`, isError: true }
      ws.set(path, null)
      return { content: `Deleted ${path}`, status: `Deleting ${path}` }
    }

    case 'write_config': {
      const previous = safeJson(ws.get(CONFIG_PATH)) as Record<string, unknown> | undefined
      const config = input.config
      const kept =
        previous && config && typeof config === 'object'
          ? Object.fromEntries(
              (['stops', 'variables'] as const).flatMap((key) =>
                previous[key] !== undefined && !(key in config) ? [[key, previous[key]]] : [],
              ),
            )
          : {}
      const parsed = presentationSchema.safeParse(config && typeof config === 'object' ? { ...config, ...kept } : config)
      if (!parsed.success) {
        const errors = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        return { content: `Not written. Fix these and retry:\n${errors.join('\n')}`, isError: true }
      }
      ws.set(CONFIG_PATH, `${JSON.stringify(parsed.data, null, 2)}\n`)
      const report = validateFolder(ws.files())
      const problems = [...report.errors, ...report.warnings]
      return {
        content: problems.length
          ? `Wrote ${CONFIG_PATH}, but the folder still has problems:\n${problems.join('\n')}`
          : `Wrote ${CONFIG_PATH}`,
        status: `Writing ${CONFIG_PATH}`,
      }
    }

    default:
      return { content: `Unknown tool ${name}`, isError: true }
  }
}

export async function generate(
  request: GenerateRequest,
  emit: (event: GenerateEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    emit({
      type: 'error',
      message: 'No Anthropic API key is set. Add one in Settings.',
    })
    return
  }

  const exists = presentationExists(request.id)
  if (request.mode === 'create' && exists) {
    emit({ type: 'error', message: `A presentation named "${request.id}" already exists.` })
    return
  }
  const modifying = request.mode !== 'create'
  if (modifying && !exists) {
    emit({ type: 'error', message: `Presentation "${request.id}" does not exist.` })
    return
  }

  const ws = new Workspace(
    modifying ? await readEditableFiles(request.id) : {},
    modifying ? await listAssetEntries(request.id) : [],
  )

  const opening =
    request.mode === 'component'
      ? componentOpening(ws, request)
      : (stageStory(ws, request) ?? { error: 'Nothing to change — edit a beat or add direction first.' })
  if (typeof opening !== 'string') {
    emit({ type: 'error', message: opening.error })
    return
  }

  const history = modifying ? formatHistory(await readHistory(request.id, { limit: HISTORY_CONTEXT_LIMIT })) : ''
  const assets = formatAssets(ws.assetList())
  const config = presentationSchema.safeParse(safeJson(ws.get(CONFIG_PATH)))
  const variables = formatVariables(config.success ? config.data.variables : undefined)
  const context = [history, assets, variables, opening].filter(Boolean).join('\n\n')

  const client = new Anthropic()
  const messages: MessageParam[] = [{ role: 'user', content: context }]

  let fixRounds = 0
  const usage: TokenUsage = { input: 0, output: 0, thinking: 0, cacheRead: 0 }

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (signal?.aborted) return
    emit({ type: 'status', message: turn === 0 ? 'Thinking…' : 'Working…' })

    const response = await client.messages
      .stream(
        {
          model: MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          output_config: { effort: 'low' },
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          tools,
          messages,
        },
        { signal },
      )
      .finalMessage()

    const turnIn =
      (response.usage.input_tokens ?? 0) +
      (response.usage.cache_creation_input_tokens ?? 0) +
      (response.usage.cache_read_input_tokens ?? 0)
    const turnOut = response.usage.output_tokens ?? 0
    const turnThink = response.usage.output_tokens_details?.thinking_tokens ?? 0
    const turnCache = response.usage.cache_read_input_tokens ?? 0
    usage.input += turnIn
    usage.output += turnOut
    usage.thinking += turnThink
    usage.cacheRead += turnCache
    emit({
      type: 'status',
      message:
        `Tokens turn ${turn + 1}: ${fmt(turnIn)} in / ${fmt(turnOut)} out` +
        (turnThink ? ` (${fmt(turnThink)} thinking)` : '') +
        (turnCache ? `, ${fmt(turnCache)} cache hit` : '') +
        ` · session ${fmt(usage.input)} in / ${fmt(usage.output)} out`,
    })

    const truncated = response.stop_reason === 'max_tokens'
    const content = truncated ? dropTrailingIncompleteTool(response.content) : response.content

    if (content.length === 0) {
      emit({ type: 'status', message: 'Hit the output cap — continuing…' })
      messages.push({
        role: 'user',
        content:
          'Your previous turn hit the output cap before a complete tool call. Continue, one file per tool call.',
      })
      continue
    }

    messages.push({ role: 'assistant', content })

    const text = content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n')
      .trim()
    const toolBlocks = content.filter((block) => block.type === 'tool_use')

    if (toolBlocks.length > 0) {
      if (text) emit({ type: 'note', message: text })
      const results: ToolResultBlockParam[] = await Promise.all(
        toolBlocks.map(async (block) => {
          const input = block.input as Record<string, unknown>
          const outcome =
            block.name === 'view_asset' ? await viewAsset(ws, request.id, input) : runTool(ws, block.name, input)
          if (outcome.status) emit({ type: 'status', message: outcome.status })
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: outcome.content,
            is_error: outcome.isError,
          }
        }),
      )
      messages.push({
        role: 'user',
        content: truncated
          ? [
              ...results,
              {
                type: 'text' as const,
                text: 'Your previous turn hit the output cap. Continue from here — retry any cut-off write as a complete tool call, one file at a time.',
              },
            ]
          : results,
      })
      continue
    }

    if (truncated) {
      emit({ type: 'status', message: 'Hit the output cap — continuing…' })
      messages.push({
        role: 'user',
        content:
          'Your previous turn hit the output cap mid-response. Continue from where you left off. Prefer one file per tool call.',
      })
      continue
    }

    const changes = ws.changes()
    const report = validateFolder(ws.files())
    const problems = [...report.errors, ...report.warnings]
    if (changes.length > 0 && problems.length > 0 && fixRounds < MAX_FIX_ROUNDS) {
      fixRounds++
      emit({ type: 'status', message: 'Fixing validation problems…' })
      messages.push({
        role: 'user',
        content: `The folder doesn't validate yet. Fix these, then summarize again:\n${problems.join('\n')}`,
      })
      continue
    }
    if (report.errors.length > 0 && changes.length > 0) {
      emit({
        type: 'error',
        message: `The result still doesn't validate:\n${report.errors.join('\n')}\n\n${usageLine(usage)}`,
      })
      return
    }

    emit({
      type: 'done',
      summary: text || 'Done.',
      changes,
      warnings: report.warnings,
      usage,
    })
    return
  }

  emit({
    type: 'error',
    message: `Stopped after ${MAX_TURNS} turns without finishing.\n\n${usageLine(usage)}`,
  })
}

/**
 * Stages the designer's story.md and builds the opening message. Returns null when a
 * modification has neither story edits nor direction.
 */
export function stageStory(ws: Workspace, request: StoryRequest): string | null {
  const markdown = serializeStory(request.story)
  const savedRaw = ws.get(STORY_PATH)
  const saved = savedRaw === undefined ? null : parseStory(savedRaw)
  const changes = saved ? diffStories(saved, request.story) : []
  const storyChanged = saved === null || changes.length > 0
  if (storyChanged) ws.set(STORY_PATH, markdown)

  const story = `<story path="${STORY_PATH}">\n${markdown}</story>`
  const notes = request.notes ? `\n\nAdditional direction from the designer:\n${request.notes}` : ''

  if (request.mode === 'create') {
    return `Create a new presentation (folder "${request.id}", currently empty) that tells this story. It is already saved as ${STORY_PATH}.\n\n${story}${notes}`
  }

  if (!storyChanged && !request.notes) return null
  const summary = !storyChanged
    ? 'The story layout is unchanged.'
    : saved === null
      ? `This presentation had no ${STORY_PATH}; the designer laid out its story for the first time.`
      : `The designer revised the story layout:\n${changes.map((c) => `- ${c}`).join('\n')}`
  return `Modify the presentation in folder "${request.id}". ${summary}\n\nThe full story (already saved as ${STORY_PATH}):\n\n${story}${notes}`
}

/**
 * Builds the opening message for an instruction scoped to one component: its source,
 * its keyframes, and where it appears in the story.
 */
export function componentOpening(ws: Workspace, request: ComponentRequest): string | { error: string } {
  const parsed = presentationSchema.safeParse(safeJson(ws.get(CONFIG_PATH)))
  if (!parsed.success) return { error: `${CONFIG_PATH} is not valid, so components can't be edited one at a time.` }
  const config = parsed.data
  const component = config.components.find((c) => c.id === request.component)
  if (!component) return { error: `There is no component "${request.component}" in this presentation.` }
  const source = ws.get(component.file)
  if (source === undefined) return { error: `${component.file} is missing.` }

  const story = ws.get(STORY_PATH)
  const beats = story ? parseStory(story).beats : []
  const titleOf = (phaseId: string) =>
    beats.find((b) => b.id === phaseId)?.title ?? config.phases.find((p) => p.id === phaseId)?.label ?? phaseId
  const keyframes = resolveKeyframes(component.keyframes)
  const onStage = layoutPhases(config.phases)
    .filter((range) => poseAt(keyframes, range.start).opacity > 0.05)
    .map((range) => `"${titleOf(range.id)}" (${range.id})`)
  const viewing =
    request.beat && config.phases.some((p) => p.id === request.beat)
      ? ` They were looking at the beat "${titleOf(request.beat)}" (phase ${request.beat}, starting at offset ${layoutPhases(config.phases).find((r) => r.id === request.beat)?.start}) when they asked.`
      : ''

  return [
    `Modify the presentation in folder "${request.id}". The designer right-clicked the component "${component.id}" and gave an instruction scoped to it.${viewing}`,
    `<component id="${component.id}" file="${component.file}">`,
    `<keyframes>\n${JSON.stringify(component.keyframes)}\n</keyframes>`,
    `<source>\n${source.trimEnd()}\n</source>`,
    `</component>`,
    `On stage at the rest frame of: ${onStage.length ? onStage.join(', ') : 'no beat (it is only visible mid-transition)'}.`,
    `Instruction:\n${request.instruction}`,
    `Keep the change focused on this component's file and its entry in ${CONFIG_PATH}. Touch other components only if the instruction requires it (e.g. its new position collides with a neighbor). The story layout is unchanged unless the instruction says otherwise. You already have this component's source and keyframes, so edit it directly with str_replace.`,
  ].join('\n\n')
}

function safeJson(raw: string | undefined): unknown {
  try {
    return JSON.parse(raw ?? '')
  } catch {
    return undefined
  }
}

function applyStrReplace(ws: Workspace, input: Record<string, unknown>): ToolOutcome {
  const path = String(input.path ?? '')
  if (!isEditablePath(path)) {
    return { content: `"${path}" is not an editable path`, isError: true }
  }
  const current = ws.get(path)
  if (current === undefined) {
    return { content: `${path} does not exist — use write_component / write_config to create it`, isError: true }
  }

  const oldString = String(input.old_string ?? '')
  const newString = String(input.new_string ?? '')
  if (!oldString) return { content: 'old_string must not be empty', isError: true }

  const replaceAll = Boolean(input.replace_all)
  const matches = current.split(oldString).length - 1
  if (matches === 0) {
    return {
      content: `old_string was not found in ${path}. Read the file and copy the exact text.`,
      isError: true,
    }
  }
  if (matches > 1 && !replaceAll) {
    return {
      content: `old_string matched ${matches} times in ${path}. Pass a larger unique snippet, or replace_all: true.`,
      isError: true,
    }
  }

  const next = replaceAll ? current.split(oldString).join(newString) : current.replace(oldString, newString)
  const errors = validateEditedFile(path, next)
  if (errors.length > 0) {
    return { content: `Not applied. Fix these and retry:\n${errors.join('\n')}`, isError: true }
  }
  ws.set(path, next)
  return { content: `Updated ${path} (${matches} replacement${matches === 1 ? '' : 's'})`, status: `Editing ${path}` }
}

function validateEditedFile(path: string, source: string): string[] {
  if (path === CONFIG_PATH) {
    try {
      const parsed = presentationSchema.safeParse(JSON.parse(source))
      if (parsed.success) return []
      return parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    } catch (error) {
      return [`invalid JSON (${(error as Error).message})`]
    }
  }
  if (COMPONENT_PATH.test(path)) return validateComponentSource(source)
  if (path === STORY_PATH) {
    return parseStory(source).beats.length > 0 ? [] : [`${STORY_PATH} must keep at least one "## " beat`]
  }
  return [`${path} is not an editable path`]
}

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

function usageLine(usage: TokenUsage): string {
  return (
    `This run used ${fmt(usage.input)} input tokens and ${fmt(usage.output)} output tokens` +
    (usage.thinking ? ` (${fmt(usage.thinking)} of those were thinking)` : '') +
    (usage.cacheRead ? `; ${fmt(usage.cacheRead)} input tokens were cache hits` : '') +
    '.'
  )
}

/** A max_tokens stop often truncates the last tool_use JSON — drop it so we don't send a broken call. */
function dropTrailingIncompleteTool(content: ContentBlock[]): ContentBlock[] {
  const last = content[content.length - 1]
  if (last?.type === 'tool_use') return content.slice(0, -1)
  return content
}
