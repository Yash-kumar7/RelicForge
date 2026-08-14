import { useCallback, useEffect, useRef } from "react";
import { useGameStore } from "../state/useGameStore";
import { requestRelic, saveTransform, streamRelic } from "../lib/relicClient";
import type { RelicTransform } from "@relic/core";

/**
 * Drives one forge run: snapshot telemetry, ask the server for a relic, then
 * translate the event stream into forge stages.
 *
 * The stage machine is what the cinematic renders from — no booleans, so an
 * impossible on-screen state is impossible by construction.
 */
export function useForgeRun() {
  const unsubscribe = useRef<(() => void) | null>(null);
  const patchForge = useGameStore((s) => s.patchForge);
  const setPhase = useGameStore((s) => s.setPhase);

  useEffect(() => () => unsubscribe.current?.(), []);

  const start = useCallback(
    async (mode: "dev" | "hero" = "hero") => {
      const telemetry = useGameStore.getState().snapshotTelemetry();
      setPhase("FORGING");
      patchForge({ stage: "ANALYZING" });

      try {
        const relic = await requestRelic(telemetry, useGameStore.getState().boss().name, mode);

        patchForge({
          relicId: relic.relicId,
          name: relic.name,
          dna: relic.dna,
          cached: relic.cached,
          stage: "DNA_READY",
        });

        // A cache hit arrives complete. Still play the sequence — the beats are
        // the product, and skipping them because the asset was ready would make
        // the fast path feel like a different, lesser experience.
        if (relic.cached && relic.modelUrl) {
          patchForge({
            conceptUrl: relic.conceptUrl,
            modelUrl: relic.modelUrl,
            transform: relic.transform,
            totalMs: relic.totalMs,
            meshPercent: 100,
            stage: "COMPLETE",
          });
          return;
        }

        unsubscribe.current = streamRelic(relic.relicId, (event) => {
          switch (event.type) {
            case "dna.ready":
              patchForge({ dna: event.dna, name: event.name, stage: "DNA_READY" });
              break;
            case "concept.generating":
              patchForge({ stage: "GENERATING_CONCEPT" });
              break;
            case "concept.ready":
              patchForge({ conceptUrl: event.conceptUrl, stage: "CONCEPT_READY" });
              break;
            case "mesh.generating":
              patchForge({ stage: "FORGING_3D", meshPercent: 0 });
              break;
            case "mesh.progress":
              patchForge({ meshPercent: event.percent });
              break;
            case "mesh.ready":
              patchForge({ modelUrl: event.modelUrl, meshPercent: 100, stage: "MODEL_READY" });
              break;
            case "relic.complete":
              patchForge({
                modelUrl: event.modelUrl,
                conceptUrl: event.conceptUrl,
                transform: event.transform,
                totalMs: event.totalMs,
                stage: "COMPLETE",
              });
              break;
            case "relic.failed":
              // The player sees "THE FORGE RESISTS", never a stack trace.
              patchForge({
                stage: "FAILED",
                error: event.retryable ? "retryable" : "fatal",
              });
              break;
          }
        });
      } catch (err) {
        patchForge({ stage: "FAILED", error: (err as Error).message });
      }
    },
    [patchForge, setPhase],
  );

  /** Persists the canonical transform so re-equipping is stable across reloads. */
  const persistTransform = useCallback((transform: RelicTransform) => {
    const relicId = useGameStore.getState().forge.relicId;
    if (relicId) void saveTransform(relicId, transform);
  }, []);

  return { start, persistTransform };
}
