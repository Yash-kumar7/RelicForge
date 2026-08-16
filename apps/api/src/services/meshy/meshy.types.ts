import { z } from "zod";

/**
 * Every Meshy response is parsed through these. A third-party shape change
 * should fail loudly at the boundary, not surface as `undefined` three layers
 * deep inside the forge sequence.
 */

export const TaskStatusSchema = z.enum([
  "PENDING",
  "IN_PROGRESS",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const CreateTaskResponseSchema = z.object({
  result: z.string().min(1),
});

export const TaskErrorSchema = z
  .object({ message: z.string().optional() })
  .nullish();

/**
 * Validation posture: strict on the fields we actually consume, permissive on
 * everything else. In-progress tasks legitimately carry `thumbnail_url: ""` and
 * `texture_urls: null`, and rejecting those would fail a task that is merely
 * unfinished, after its credits are already spent. Parse must not be stricter
 * than the contract we depend on.
 */
const maybeUrl = z.string().nullish().transform((v) => (v ? v : undefined));

/** Text-to-Image task object. */
export const ImageTaskSchema = z
  .object({
    id: z.string(),
    status: TaskStatusSchema,
    progress: z.number().min(0).max(100).nullish(),
    image_urls: z.array(z.string()).nullish().transform((v) => v ?? []),
    task_error: TaskErrorSchema,
    created_at: z.number().nullish(),
    finished_at: z.number().nullish(),
  })
  .passthrough();
export type ImageTask = z.infer<typeof ImageTaskSchema>;

const ModelUrlsSchema = z.object({
  glb: maybeUrl,
  fbx: maybeUrl,
  obj: maybeUrl,
  usdz: maybeUrl,
});
type ModelUrls = z.infer<typeof ModelUrlsSchema>;
const EMPTY_MODEL_URLS: ModelUrls = {
  glb: undefined,
  fbx: undefined,
  obj: undefined,
  usdz: undefined,
};

/** Image-to-3D task object. */
export const MeshTaskSchema = z
  .object({
    id: z.string(),
    status: TaskStatusSchema,
    progress: z.number().min(0).max(100).nullish(),
    model_urls: ModelUrlsSchema.nullish().transform((v) => v ?? EMPTY_MODEL_URLS),
    thumbnail_url: maybeUrl,
    texture_urls: z.array(z.record(z.string(), z.unknown())).nullish(),
    task_error: TaskErrorSchema,
    created_at: z.number().nullish(),
    finished_at: z.number().nullish(),
  })
  .passthrough();
export type MeshTask = z.infer<typeof MeshTaskSchema>;

/**
 * Rigging task. Shaped differently from generation tasks: the payload lives
 * under `result`, and the free walking and running clips arrive as separate
 * skinned GLBs rather than as clips inside the rigged model.
 */
export const RigTaskSchema = z
  .object({
    id: z.string(),
    status: TaskStatusSchema,
    progress: z.number().nullish(),
    task_error: TaskErrorSchema,
    consumed_credits: z.number().nullish(),
    result: z
      .object({
        rigged_character_glb_url: maybeUrl,
        rigged_character_fbx_url: maybeUrl,
        basic_animations: z
          .object({
            walking_glb_url: maybeUrl,
            walking_fbx_url: maybeUrl,
            running_glb_url: maybeUrl,
            running_fbx_url: maybeUrl,
          })
          .nullish(),
      })
      .nullish(),
  })
  .passthrough();
export type RigTask = z.infer<typeof RigTaskSchema>;

/**
 * An animation task, which is a rig plus one action from Meshy's library.
 *
 * Separate from RigTaskSchema because the payload is a different shape: rigging
 * returns a rigged character and its two free clips nested under
 * basic_animations, while an animation returns one clip at the top level.
 */
export const AnimationTaskSchema = z
  .object({
    id: z.string(),
    status: TaskStatusSchema,
    progress: z.number().nullish(),
    task_error: TaskErrorSchema,
    consumed_credits: z.number().nullish(),
    result: z
      .object({
        /*
         * animation_glb_url, and the name matters.
         *
         * This was written as animated_character_glb_url by analogy with
         * rigging's rigged_character_glb_url, which cost eight tasks: every one
         * succeeded, the schema silently parsed the result as an object with no
         * urls in it, and the script reported "animation returned no glb" for
         * all of them. The clips were sitting there the whole time.
         */
        animation_glb_url: maybeUrl,
        animation_fbx_url: maybeUrl,
      })
      .nullish(),
  })
  .passthrough();

export type AnimationTask = z.infer<typeof AnimationTaskSchema>;

/** GET /openapi/v1/{kind}, recent tasks, newest first. */
export const TaskListSchema = z.array(z.unknown());

export const BalanceSchema = z.object({ balance: z.number() });

/**
 * Each task type is its own REST resource. A remesh task is NOT readable at
 * /v1/image-to-3d/:id even though it produces the same object shape.
 */
export type TaskKind =
  | "text-to-image"
  /** Edits an existing image. Same response shape as text-to-image. */
  | "image-to-image"
  | "image-to-3d"
  | "remesh"
  | "retexture";
