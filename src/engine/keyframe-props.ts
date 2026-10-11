/** Kept out of schema.ts so runtime code (and saved HTML files) doesn't pull in zod. */
export const KEYFRAME_PROPS = [
  'x',
  'y',
  'z',
  'scale',
  'rotateX',
  'rotateY',
  'rotateZ',
  'opacity',
] as const

export type KeyframeProp = (typeof KEYFRAME_PROPS)[number]
