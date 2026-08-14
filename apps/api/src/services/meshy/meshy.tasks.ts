import { meshyFetch, meshyJson } from "./meshy.client.js";
import {
  ImageTaskSchema,
  MeshTaskSchema,
  type ImageTask,
  type MeshTask,
  type TaskKind,
} from "./meshy.types.js";
import { MeshyTaskFailed, MeshyTimeout } from "../../lib/errors.js";

type TaskFor<K extends TaskKind> = K extends "text-to-image" ? ImageTask : MeshTask;

/** Kinds whose output is a mesh, and therefore parse as MeshTask. */
export const MESH_KINDS = ["image-to-3d", "remesh"] as const;

function parseTask<K extends TaskKind>(kind: K, raw: unknown): TaskFor<K> {
  return (kind === "text-to-image"
    ? ImageTaskSchema.parse(raw)
    : MeshTaskSchema.parse(raw)) as TaskFor<K>;
}

export async function getTask<K extends TaskKind>(kind: K, id: string): Promise<TaskFor<K>> {
  return parseTask(kind, await meshyJson<unknown>(`/v1/${kind}/${id}`, { method: "GET" }));
}

/**
 * Meshy exposes native SSE per task. Consuming it directly is why RelicForge
 * needs no webhook receiver and no public tunnel for local development —
 * we simply re-emit these into our own /api/relics/:id/events stream.
 */
export async function* streamTask<K extends TaskKind>(
  kind: K,
  id: string,
  { stallTimeoutMs = 8 * 60_000 }: { stallTimeoutMs?: number } = {},
): AsyncGenerator<TaskFor<K>> {
  const res = await meshyFetch(`/v1/${kind}/${id}/stream`, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    timeoutMs: stallTimeoutMs,
  });

  if (!res.body) throw new MeshyTimeout(`No stream body for ${kind}/${id}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastEventAt = Date.now();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (Date.now() - lastEventAt > stallTimeoutMs) {
        throw new MeshyTimeout(`Stream for ${kind}/${id} stalled`);
      }

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const dataLines = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;

        const payload = dataLines.join("");
        if (!payload || payload === "[DONE]") continue;

        let raw: unknown;
        try {
          raw = JSON.parse(payload);
        } catch {
          continue; // heartbeat or non-JSON frame
        }

        lastEventAt = Date.now();
        const task = parseTask(kind, raw);
        yield task;

        if (task.status === "SUCCEEDED") return;
        if (task.status === "FAILED" || task.status === "CANCELED") {
          throw new MeshyTaskFailed(
            `${kind}/${id} ${task.status}: ${task.task_error?.message ?? "no detail"}`,
          );
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Stream to completion, returning the terminal task object. */
export async function waitForTask<K extends TaskKind>(
  kind: K,
  id: string,
  onProgress?: (task: TaskFor<K>) => void,
): Promise<TaskFor<K>> {
  let last: TaskFor<K> | undefined;
  for await (const task of streamTask(kind, id)) {
    last = task;
    onProgress?.(task);
  }
  // The stream can end without a SUCCEEDED frame; confirm with a direct read.
  if (!last || last.status !== "SUCCEEDED") {
    const final = await getTask(kind, id);
    if (final.status !== "SUCCEEDED") {
      throw new MeshyTaskFailed(
        `${kind}/${id} ended as ${final.status}: ${final.task_error?.message ?? "no detail"}`,
      );
    }
    return final;
  }
  return last;
}
