import { meshyJson, withRetry } from "./meshy.client.js";
import { CreateTaskResponseSchema } from "./meshy.types.js";

/**
 * Rigging and animation.
 *
 * Worth the 5 credits for a reason beyond looks: rigging ships walking and
 * running animations for free, which turns a boss that slides around the arena
 * as a rigid statue into one that actually walks at you. Custom actions cost 3
 * more each.
 *
 * Constraint: the model must be a textured humanoid GLB under 300k faces. Ours
 * are remeshed to ~10k, so that is comfortably satisfied.
 */

export interface RigOptions {
  /** Approximate character height; improves scaling and joint placement. */
  heightMeters?: number;
}

/** POST /openapi/v1/rigging */
export async function createRig(inputTaskId: string, opts: RigOptions = {}): Promise<string> {
  const raw = await withRetry(() =>
    meshyJson<unknown>("/v1/rigging", {
      method: "POST",
      body: JSON.stringify({
        input_task_id: inputTaskId,
        height_meters: opts.heightMeters ?? 1.7,
      }),
    }),
  );
  return CreateTaskResponseSchema.parse(raw).result;
}

/** POST /openapi/v1/animations */
export async function createAnimation(rigTaskId: string, actionId: number): Promise<string> {
  const raw = await withRetry(() =>
    meshyJson<unknown>("/v1/animations", {
      method: "POST",
      body: JSON.stringify({ rig_task_id: rigTaskId, action_id: actionId }),
    }),
  );
  return CreateTaskResponseSchema.parse(raw).result;
}
