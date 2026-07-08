/**
 * PDF → plain text using `unpdf` (pure-JS, serverless-safe - no native deps).
 * Returns the merged text of all pages.
 */
import "server-only";

export async function extractPdfText(buffer: Buffer): Promise<string> {
    // Dynamic import keeps unpdf out of the client bundle and only loads it
    // on the Node runtime where the upload route runs.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : text) || "";
}
