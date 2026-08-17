import type { CombatTelemetry, RelicDNA, RelicTransform } from "@relic/core";
import { api } from "./backend";

/**
 * The only module that talks to the backend.
 *
 * Nothing here mentions Meshy: the browser posts telemetry and listens to
 * domain events. Endpoint structure, task ids, credits and retries are the
 * server's business, and the API key never leaves it.
 */

export interface RelicResponse {
  relicId: string;
  name: string;
  dna: RelicDNA;
  status: string;
  conceptUrl: string | null;
  modelUrl: string | null;
  transform: RelicTransform | null;
  totalMs: number | null;
  cached: boolean;
}

export type RelicStreamEvent =
  | { type: "dna.ready"; dna: RelicDNA; name: string }
  | { type: "concept.generating"; taskId: string; index: number; total: number; candidateUrl?: string }
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
  | { type: "relic.failed"; stage: string; retryable: boolean; fallbackRelicId?: string };

export async function requestRelic(
  telemetry: CombatTelemetry,
  boss = "the Ashen Warden",
  mode: "dev" | "hero" = "hero",
): Promise<RelicResponse> {
  const res = await fetch(api("/api/relics"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ boss, telemetry, mode }),
  });
  if (!res.ok && res.status !== 202) {
    throw new Error(`Forge request failed (${res.status})`);
  }
  return (await res.json()) as RelicResponse;
}

/**
 * Subscribes to a relic's lifecycle. Returns an unsubscribe function.
 *
 * The server replays current state on connect, so a client that opens the
 * stream late, or reconnects mid-forge, is never stuck waiting for an event
 * that already fired.
 */
export function streamRelic(
  relicId: string,
  onEvent: (event: RelicStreamEvent) => void,
): () => void {
  const source = new EventSource(api(`/api/relics/${relicId}/events`));

  const handler = (event: MessageEvent<string>) => {
    try {
      onEvent(JSON.parse(event.data) as RelicStreamEvent);
    } catch {
      /* heartbeat or malformed frame */
    }
  };

  const types: RelicStreamEvent["type"][] = [
    "dna.ready",
    "concept.generating",
    "concept.ready",
    "mesh.generating",
    "mesh.progress",
    "mesh.ready",
    "relic.complete",
    "relic.failed",
  ];
  for (const type of types) source.addEventListener(type, handler as EventListener);

  return () => {
    for (const type of types) source.removeEventListener(type, handler as EventListener);
    source.close();
  };
}

/**
 * Reads a relic's current state directly.
 *
 * The stream is the fast path, not the only path. A server restart or a dropped
 * connection can end it silently, and without a way to re-read the record the UI
 * waits forever on an event that will never arrive.
 */
export async function fetchRelic(relicId: string): Promise<RelicResponse | null> {
  try {
    const res = await fetch(api(`/api/relics/${relicId}`));
    if (!res.ok) return null;
    return (await res.json()) as RelicResponse;
  } catch {
    return null;
  }
}

/** Re-runs a failed relic from the top, reusing its DNA and prompt. */
export async function retryRelic(relicId: string): Promise<void> {
  const res = await fetch(api(`/api/relics/${relicId}/retry`), { method: "POST" });
  if (!res.ok && res.status !== 202) throw new Error(`Retry failed (${res.status})`);
}

/** Persists the client-computed canonical transform so re-equip is stable. */
export async function saveTransform(relicId: string, transform: RelicTransform): Promise<void> {
  await fetch(api(`/api/relics/${relicId}/transform`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transform }),
  }).catch(() => {
    /* diagnostics only, never block the reveal on this */
  });
}
