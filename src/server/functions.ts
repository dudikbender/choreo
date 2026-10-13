import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { HISTORY_KEEP, historyEntrySchema } from '~/engine/history'
import { variablesSchema } from '~/engine/schema'

export const getPresentations = createServerFn({ method: 'GET' }).handler(async () => {
  const { listPresentations } = await import('./workspace')
  return listPresentations()
})

export const getApiKeyStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const { apiKeyStatus } = await import('./settings')
  return apiKeyStatus()
})

export const setApiKey = createServerFn({ method: 'POST' })
  .validator(z.object({ key: z.string().max(500), replace: z.boolean().optional() }))
  .handler(async ({ data }) => {
    const { saveApiKey } = await import('./settings')
    return saveApiKey(data.key, { replace: data.replace })
  })

export const getStory = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { readStory } = await import('./workspace')
    return readStory(data.id)
  })

export const layoutStory = createServerFn({ method: 'POST' })
  .validator(z.object({ title: z.string(), description: z.string().trim().min(1).max(20_000) }))
  .handler(async ({ data }) => {
    const { layoutStory } = await import('./layout')
    return layoutStory(data.title, data.description)
  })

export const saveStops = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), stops: z.array(z.number().min(0)).nullable() }))
  .handler(async ({ data }) => {
    const { updateStops } = await import('./workspace')
    return updateStops(data.id, data.stops)
  })

export const getVariableUsage = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { variableUsage } = await import('./workspace')
    return variableUsage(data.id)
  })

export const saveVariables = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), variables: variablesSchema }))
  .handler(async ({ data }) => {
    const { updateVariables } = await import('./workspace')
    return updateVariables(data.id, data.variables)
  })

export const removeComponent = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), component: z.string() }))
  .handler(async ({ data }) => {
    const { deleteComponent } = await import('./workspace')
    return deleteComponent(data.id, data.component)
  })

export const removePresentation = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { deletePresentation } = await import('./workspace')
    await deletePresentation(data.id)
  })

export const renamePresentation = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), title: z.string().trim().min(1).max(200) }))
  .handler(async ({ data }) => {
    const { renamePresentation } = await import('./workspace')
    return renamePresentation(data.id, data.title)
  })

export const forkPresentation = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { forkPresentation } = await import('./workspace')
    return forkPresentation(data.id)
  })

const historyInputSchema = historyEntrySchema.omit({ at: true, outcome: true })

const applySchema = z.object({
  id: z.string(),
  create: z.boolean(),
  changes: z.array(
    z.object({ path: z.string(), before: z.string().nullable(), after: z.string().nullable() }),
  ),
  /** Logged to the presentation's history once the changes are written. */
  history: historyInputSchema.optional(),
})

export const applyProposal = createServerFn({ method: 'POST' })
  .validator(applySchema)
  .handler(async ({ data }) => {
    const { appendHistory, applyChanges } = await import('./workspace')
    const report = await applyChanges(data.id, data.changes, { create: data.create })
    if (report.errors.length === 0 && data.history) {
      await appendHistory(data.id, { ...data.history, outcome: 'applied' })
    }
    return report
  })

export const recordDiscard = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), history: historyInputSchema }))
  .handler(async ({ data }) => {
    const { appendHistory } = await import('./workspace')
    await appendHistory(data.id, { ...data.history, outcome: 'discarded' })
  })

export const getHistory = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string(), component: z.string().optional(), phase: z.string().optional() }))
  .handler(async ({ data }) => {
    const { readHistory } = await import('./workspace')
    return readHistory(data.id, { limit: HISTORY_KEEP, component: data.component, phase: data.phase })
  })

export const getAssets = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { listAssetEntries, listOtherAssets } = await import('./assets')
    const [assets, others] = await Promise.all([listAssetEntries(data.id), listOtherAssets(data.id)])
    return { assets, others }
  })

export const addAssetUrl = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), url: z.string().url(), description: z.string().optional() }))
  .handler(async ({ data }) => {
    const { addUrlAsset } = await import('./assets')
    return addUrlAsset(data.id, data.url, data.description)
  })

export const describeAsset = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), name: z.string(), description: z.string() }))
  .handler(async ({ data }) => {
    const { describeAssetEntry } = await import('./assets')
    await describeAssetEntry(data.id, data.name, data.description)
  })

export const removeAsset = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), name: z.string() }))
  .handler(async ({ data }) => {
    const { removeAssetEntry } = await import('./assets')
    return removeAssetEntry(data.id, data.name)
  })

export const copyAsset = createServerFn({ method: 'POST' })
  .validator(z.object({ from: z.string(), name: z.string(), to: z.string() }))
  .handler(async ({ data }) => {
    const { copyAssetEntry } = await import('./assets')
    return copyAssetEntry(data.from, data.name, data.to)
  })

export const getComponentSource = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string(), path: z.string() }))
  .handler(async ({ data }) => {
    const { readComponentSource } = await import('./workspace')
    return readComponentSource(data.id, data.path)
  })

export const saveComponent = createServerFn({ method: 'POST' })
  .validator(
    z.object({ id: z.string(), component: z.string(), path: z.string(), before: z.string(), after: z.string() }),
  )
  .handler(async ({ data: { id, ...edit } }) => {
    const { saveComponentSource } = await import('./workspace')
    return saveComponentSource(id, edit)
  })
