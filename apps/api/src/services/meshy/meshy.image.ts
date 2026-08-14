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
