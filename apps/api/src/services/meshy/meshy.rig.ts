import { meshyJson, withRetry } from "./meshy.client.js";
import { CreateTaskResponseSchema, RigTaskSchema, type RigTask } from "./meshy.types.js";
import { MeshyTaskFailed, MeshyTimeout } from "../../lib/errors.js";

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

export async function getRigTask(id: string): Promise<RigTask> {
  return RigTaskSchema.parse(await meshyJson<unknown>(`/v1/rigging/${id}`, { method: "GET" }));
}

/**
 * Polls a rig task to completion.
 *
 * Rigging has no stream endpoint, so unlike generation there is nothing to
 * consume: it is polling by necessity rather than as a fallback.
 */
export async function waitForRig(
  id: string,
  onProgress?: (task: RigTask) => void,
  { pollIntervalMs = 4000, timeoutMs = 10 * 60_000 } = {},
): Promise<RigTask> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = await getRigTask(id);
    onProgress?.(task);
    if (task.status === "SUCCEEDED") return task;
    if (task.status === "FAILED" || task.status === "CANCELED") {
      throw new MeshyTaskFailed(
        `rigging/${id} ${task.status}: ${task.task_error?.message ?? "no detail"}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new MeshyTimeout(`rigging/${id} did not finish in time`);
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
