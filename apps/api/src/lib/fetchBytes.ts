import { MeshyServerError } from "./errors.js";

/**
 * Downloads a URL as bytes.
 *
 * Exists because the DOM and Node lib definitions disagree about what
 * `Response.arrayBuffer()` returns, and every asset download in the pipeline
 * would otherwise need the same cast.
 */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new MeshyServerError(`Failed to download asset (${res.status}): ${url.slice(0, 120)}`);
  }
  const buffer = (await res.arrayBuffer()) as ArrayBuffer;
  return new Uint8Array(buffer);
}

/** Node's fs APIs want a Buffer; this keeps the conversion in one place. */
export async function fetchBuffer(url: string): Promise<Buffer> {
  return Buffer.from(await fetchBytes(url));
}
