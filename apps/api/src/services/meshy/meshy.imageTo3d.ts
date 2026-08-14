import { meshyJson, withRetry } from "./meshy.client.js";
import { CreateTaskResponseSchema } from "./meshy.types.js";

export interface MeshOptions {
  meshyModel: "meshy-7";
  ultraMode: boolean;
  targetPolycount: number;
  enablePbr: boolean;
  targetFormats: readonly string[];
  shouldTexture?: boolean;
  shouldRemesh?: boolean;
}

/**
 * POST /openapi/v1/image-to-3d
 *
 * Chained by `input_task_id` rather than `image_url`: Meshy accepts the id of a
 * completed text-to-image task directly, so the concept image never needs to be
 * publicly hosted. That deletes an entire storage dependency from the hero path.
 *
 * `target_formats: ["glb"]` is deliberate — the docs state that requesting fewer
 * formats reduces task completion time, and glb is the only one the game loads.
 *
 * `should_remesh` MUST be sent explicitly: it defaults to false on meshy-6/7,
 * and `target_polycount` only takes effect when it is true. Leaving it off
 * yielded 1.5M–3.1M triangle meshes (37–116 MB) that no browser game can load.
 * Meshy recommends false for maximum fidelity; a real-time weapon needs
 * playable topology more than it needs another million triangles.
 */
export async function createMeshFromConceptTask(
  conceptTaskId: string,
  opts: MeshOptions,
): Promise<string> {
  const raw = await withRetry(() =>
    meshyJson<unknown>("/v1/image-to-3d", {
      method: "POST",
      body: JSON.stringify({
        input_task_id: conceptTaskId,
        ai_model: opts.meshyModel,
        ultra_mode: opts.ultraMode,
        should_texture: opts.shouldTexture ?? true,
        should_remesh: opts.shouldRemesh ?? true,
        enable_pbr: opts.enablePbr,
        target_formats: opts.targetFormats,
        target_polycount: opts.targetPolycount,
      }),
    }),
  );
  return CreateTaskResponseSchema.parse(raw).result;
}
