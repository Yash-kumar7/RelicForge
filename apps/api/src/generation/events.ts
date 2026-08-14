import { EventEmitter } from "node:events";
import type { RelicDNA, RelicStatus, RelicTransform } from "@relic/core";

/**
 * In-process event bus between the generation pipeline and any SSE clients
 * watching a relic.
 *
 * Deliberately not a queue: a single-process demo does not need one, and a
 * reconnecting client gets the current state replayed from the record instead
 * of a backlog of stale frames.
 */

export type RelicEvent =
  | { type: "dna.ready"; dna: RelicDNA; name: string }
  | { type: "concept.generating"; taskId: string }
  | { type: "concept.ready"; conceptUrl: string; ms: number }
  | { type: "mesh.generating"; taskId: string }
  | { type: "mesh.progress"; percent: number }
  | { type: "mesh.ready"; modelUrl: string; ms: number; bytes: number }
  | {
      type: "relic.complete";
      relicId: string;
      name: string;
      dna: RelicDNA;
      conceptUrl: string | null;
      modelUrl: string;
      transform: RelicTransform | null;
      totalMs: number;
      cached: boolean;
    }
  | { type: "relic.failed"; stage: RelicStatus; retryable: boolean; fallbackRelicId?: string };

const bus = new EventEmitter();
bus.setMaxListeners(64);

export function emitRelicEvent(relicId: string, event: RelicEvent): void {
  bus.emit(relicId, event);
}

export function onRelicEvent(relicId: string, listener: (event: RelicEvent) => void): () => void {
  bus.on(relicId, listener);
  return () => bus.off(relicId, listener);
}
