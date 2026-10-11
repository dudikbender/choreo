/** Fetches `url` and saves the response as `filename`; throws the endpoint's `{ error }` message on failure. */
export async function download(url: string, filename: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${response.status})`)
  }
  const objectUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
}
