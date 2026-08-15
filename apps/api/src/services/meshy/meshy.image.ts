import { meshyJson, withRetry } from "./meshy.client.js";
import { CreateTaskResponseSchema } from "./meshy.types.js";

export interface ConceptImageOptions {
  /** nano-banana (3cr) | nano-banana-2 (6cr) | nano-banana-pro (9cr) */
  imageModel: string;
  aspectRatio?: string;
}

/** POST /openapi/v1/text-to-image → task id */
export async function createConceptImage(
  prompt: string,
  opts: ConceptImageOptions,
): Promise<string> {
  const raw = await withRetry(() =>
    meshyJson<unknown>("/v1/text-to-image", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        ai_model: opts.imageModel,
        aspect_ratio: opts.aspectRatio ?? "1:1",
      }),
    }),
  );
  return CreateTaskResponseSchema.parse(raw).result;
}

export interface ImageEditOptions {
  /** nano-banana (3cr) | nano-banana-2 (6cr) | nano-banana-pro (9cr) */
  imageModel: string;
}

/**
 * POST /openapi/v1/image-to-image → task id
 *
 * Edits an existing concept rather than generating a new one. The distinction
 * matters for anything that needs two versions of the same character: a second
 * text-to-image run from an identical prompt returns a different character, with
 * different armour detail, proportions and lighting. Editing the image keeps the
 * character and changes only what the prompt asks for.
 *
 * The reference is passed as a data URI so the concept never needs to be
 * publicly hosted, the same reason the mesh stage chains off a task id.
 */
export async function editConceptImage(
  prompt: string,
  referenceDataUri: string,
  opts: ImageEditOptions,
): Promise<string> {
  const raw = await withRetry(() =>
    meshyJson<unknown>("/v1/image-to-image", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        ai_model: opts.imageModel,
        reference_image_urls: [referenceDataUri],
      }),
    }),
  );
  return CreateTaskResponseSchema.parse(raw).result;
}
