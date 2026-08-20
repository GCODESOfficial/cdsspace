const pdfBytesCache = new Map<string, Promise<Uint8Array>>();

/**
 * Download a secured publication PDF once per browser session and share the
 * bytes between its generated cover and document viewer.
 */
export function loadIntelligencePdf(source: string) {
  const cached = pdfBytesCache.get(source);
  if (cached) return cached;

  const task = fetch(source, { cache: "force-cache", credentials: "include" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Could not load the publication document.");
      return new Uint8Array(await response.arrayBuffer());
    });

  pdfBytesCache.set(source, task);
  task.catch(() => pdfBytesCache.delete(source));
  return task;
}
