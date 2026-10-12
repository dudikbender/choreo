/**
 * Fetches `url` and saves the response under the server's file name (Content-Disposition), or
 * `fallbackName`. Throws the endpoint's `{ error }` message on failure.
 */
export async function download(
  url: string,
  fallbackName: string,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}
