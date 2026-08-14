import { meshyJson, withRetry } from "./meshy.client.js";
import { CreateTaskResponseSchema } from "./meshy.types.js";

export interface RemeshOptions {
  targetPolycount: number;
  topology?: "triangle" | "quad";
  targetFormats?: readonly string[];
}

/**
 * POST /openapi/v1/remesh, decimate an already-generated mesh by task id.
 *
 * The production pipeline gets this for free via `should_remesh: true` on the
 * image-to-3d call. This standalone path exists for meshes that were already
 * paid for at full density: 5 credits to rescue one, versus ~44 to regenerate.
 */
export async function createRemesh(
  inputTaskId: string,
  opts: RemeshOptions,
): Promise<string> {
  const raw = await withRetry(() =>
    meshyJson<unknown>("/v1/remesh", {
      method: "POST",
      body: JSON.stringify({
        input_task_id: inputTaskId,
        target_polycount: opts.targetPolycount,
        topology: opts.topology ?? "triangle",
        target_formats: opts.targetFormats ?? ["glb"],
      }),
    }),
  );
  return CreateTaskResponseSchema.parse(raw).result;
}
