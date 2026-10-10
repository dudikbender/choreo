import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'

const ENV_PATH = path.resolve('.env')
const KEY_NAME = 'ANTHROPIC_API_KEY'

export interface ApiKeyStatus {
  set: boolean
  /** First and last few characters, never the whole key. */
  hint: string | null
}

export function apiKeyStatus(): ApiKeyStatus {
  const key = process.env[KEY_NAME]?.trim()
  return { set: Boolean(key), hint: key ? `${key.slice(0, 10)}…${key.slice(-4)}` : null }
}

async function verify(apiKey: string) {
  try {
    await new Anthropic({ apiKey }).models.list({ limit: 1 })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new Error('Anthropic rejected that key. Check it and try again.')
    if (error instanceof Anthropic.PermissionDeniedError) throw new Error("That key doesn't have access to the API.")
    throw new Error(`Couldn't verify the key: ${(error as Error).message}`)
  }
}

/** Verifies the key with Anthropic, then writes it to .env and the running server's environment. */
export async function saveApiKey(rawKey: string, { replace = false } = {}): Promise<ApiKeyStatus> {
  const key = rawKey.trim()
  if (!key) throw new Error('Enter an API key.')
  if (/\s/.test(key)) throw new Error("API keys don't contain spaces.")
  if (apiKeyStatus().set && !replace) throw new Error('An API key is already set.')
  await verify(key)

  const current = existsSync(ENV_PATH) ? await readFile(ENV_PATH, 'utf8') : ''
  const line = `${KEY_NAME}=${key}`
  const pattern = new RegExp(`^${KEY_NAME}=.*$`, 'm')
  const next = pattern.test(current)
    ? current.replace(pattern, line)
    : `${current}${current && !current.endsWith('\n') ? '\n' : ''}${line}\n`
  await writeFile(ENV_PATH, next, { mode: 0o600 })
  process.env[KEY_NAME] = key
  return apiKeyStatus()
}
