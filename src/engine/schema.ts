import { z } from 'zod'
import { KEYFRAME_PROPS } from './keyframe-props'

export { KEYFRAME_PROPS }
export type { KeyframeProp } from './keyframe-props'

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase-kebab-case slug')

// Omitted properties carry forward from the previous keyframe (see resolveKeyframes).
export const keyframeSchema = z.strictObject({
  at: z.number().min(0),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
  scale: z.number().optional(),
  rotateX: z.number().optional(),
  rotateY: z.number().optional(),
  rotateZ: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
})

export const phaseSchema = z.strictObject({
  id: slug,
  label: z.string().min(1),
  duration: z.number().positive(),
})

/** A hand-placed stop point: a scroll offset that arrow keys snap to and PDF export captures. */
export const stopSchema = z.strictObject({
  at: z.number().min(0),
})

export const componentSchema = z.strictObject({
  id: slug,
  file: z
    .string()
    .regex(
      /^components\/[a-z0-9]+(?:-[a-z0-9]+)*\.tsx$/,
      'must point at components/<kebab-case-name>.tsx',
    ),
  keyframes: z
    .array(keyframeSchema)
    .min(1)
    .refine((kfs) => kfs.every((kf, i) => i === 0 || kf.at > kfs[i - 1].at), {
      message: 'keyframes must be sorted by `at` with no duplicate offsets',
    }),
})

export const CURRENT_VERSION = 1

/** Stage + letterbox fill. Defaults to Tailwind neutral-900. */
export const DEFAULT_BACKGROUND = '#171717'

const cssColor = z
  .string()
  .regex(
    /^(#[0-9a-fA-F]{3,8}|rgb(a)?\([^)]+\)|hsl(a)?\([^)]+\)|[a-zA-Z]{3,30})$/,
    'must be a CSS color (#hex, rgb(), hsl(), or a named color)',
  )

export const VARIABLE_NAME = /^[a-z][A-Za-z0-9]*$/

/** Text values shared across components, e.g. a client's name. Components read them from `vars`. */
export const variablesSchema = z.record(z.string(), z.string()).superRefine((variables, ctx) => {
  for (const name of Object.keys(variables)) {
    if (!VARIABLE_NAME.test(name)) {
      ctx.addIssue({ code: 'custom', path: [name], message: `"${name}" must be camelCase, like clientName` })
    }
  }
})

export const presentationSchema = z
  .strictObject({
    version: z.literal(CURRENT_VERSION),
    meta: z.strictObject({
      title: z.string().min(1),
      aspectRatio: z
        .string()
        .regex(/^\d+:\d+$/, 'must look like "16:9"')
        .default('16:9'),
      backgroundColor: cssColor.default(DEFAULT_BACKGROUND),
    }),
    phases: z.array(phaseSchema).min(1),
    /** Omitted = every phase start is a stop. */
    stops: z.array(stopSchema).min(1).optional(),
    variables: variablesSchema.optional(),
    components: z.array(componentSchema),
  })
  .superRefine((config, ctx) => {
    const end = config.phases.reduce((sum, phase) => sum + phase.duration, 0)
    config.stops?.forEach((stop, i) => {
      if (i > 0 && stop.at <= config.stops![i - 1].at) {
        ctx.addIssue({ code: 'custom', path: ['stops', i, 'at'], message: 'stops must be sorted with no duplicates' })
      }
      if (stop.at > end) {
        ctx.addIssue({
          code: 'custom',
          path: ['stops', i, 'at'],
          message: `stop at ${stop.at} is past the end of the track (${end})`,
        })
      }
    })
    for (const key of ['phases', 'components'] as const) {
      const seen = new Set<string>()
      config[key].forEach((item, i) => {
        if (seen.has(item.id)) {
          ctx.addIssue({
            code: 'custom',
            path: [key, i, 'id'],
            message: `duplicate id "${item.id}"`,
          })
        }
        seen.add(item.id)
      })
    }
  })

export type Keyframe = z.infer<typeof keyframeSchema>
export type Phase = z.infer<typeof phaseSchema>
export type Stop = z.infer<typeof stopSchema>
export type Variables = z.infer<typeof variablesSchema>
export type PresentationComponent = z.infer<typeof componentSchema>
export type Presentation = z.infer<typeof presentationSchema>
