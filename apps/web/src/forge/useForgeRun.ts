import { useCallback, useEffect, useRef } from "react";
import { useGameStore } from "../state/useGameStore";
import {
  fetchRelic,
  requestRelic,
  retryRelic,
  saveTransform,
  streamRelic,
} from "../lib/relicClient";
import type { RelicTransform } from "@relic/core";

/**
 * Drives one forge run: snapshot telemetry, ask the server for a relic, then
 * translate the event stream into forge stages.
 *
 * The stage machine is what the cinematic renders from, no booleans, so an
 * impossible on-screen state is impossible by construction.
 */
/** No event for this long means the stream is probably dead, not merely quiet. */
const SILENCE_BEFORE_RESYNC_MS = 25_000;
/** Total silence after which the forge is declared failed rather than pending. */
const SILENCE_BEFORE_FAILURE_MS = 8 * 60_000;

export function useForgeRun() {
  const unsubscribe = useRef<(() => void) | null>(null);
  const watchdog = useRef<number | null>(null);
  const lastEventAt = useRef(0);
  const patchForge = useGameStore((s) => s.patchForge);
  const setPhase = useGameStore((s) => s.setPhase);

  const stopWatchdog = useCallback(() => {
    if (watchdog.current !== null) {
      clearInterval(watchdog.current);
      watchdog.current = null;
    }
  }, []);

  /**
   * Watches for a stream that has gone quiet and re-reads the record.
   *
   * A dev-server restart, a dropped connection or a proxy timeout ends the
   * stream without an error the client can see, and the forge then waits on an
   * event that will never arrive. This is what left a run sitting on "A SHAPE IS
   * BEING IMAGINED" indefinitely. Polling only after a long silence keeps the
   * stream as the fast path while making it impossible to hang on it.
   */
  const startWatchdog = useCallback(
    (relicId: string) => {
      stopWatchdog();
      lastEventAt.current = performance.now();

      watchdog.current = window.setInterval(() => {
        const silence = performance.now() - lastEventAt.current;
        if (silence < SILENCE_BEFORE_RESYNC_MS) return;

        void fetchRelic(relicId).then((relic) => {
          if (!relic) return;

          if (relic.status === "COMPLETE" && relic.modelUrl) {
            patchForge({
              modelUrl: relic.modelUrl,
              conceptUrl: relic.conceptUrl,
              transform: relic.transform,
              totalMs: relic.totalMs,
              meshPercent: 100,
              stage: "COMPLETE",
            });
            stopWatchdog();
            return;
          }

          if (relic.status === "FAILED") {
            patchForge({ stage: "FAILED", error: "The stream ended before the forge did" });
            stopWatchdog();
            return;
          }

          // Still working: the record advanced even if the stream did not, so
          // reflect where it actually is.
          if (relic.conceptUrl) patchForge({ conceptUrl: relic.conceptUrl });

          if (silence > SILENCE_BEFORE_FAILURE_MS) {
            patchForge({ stage: "FAILED", error: "The forge stopped responding" });
            stopWatchdog();
          }
        });
      }, 5000);
    },
    [patchForge, stopWatchdog],
  );

  useEffect(
    () => () => {
      unsubscribe.current?.();
      stopWatchdog();
    },
    [stopWatchdog],
  );

  /**
   * Identifies the run in progress, so a paced sequence can tell whether it is
   * still the one on screen.
   *
   * A cached forge is a chain of timers rather than a stream, and the player can
   * walk out of it: claim, abandon, or start another fight. Without a token the
   * timers keep firing into a store that has moved on, and stages from a finished
   * run appear over a new one.
   */
  const runToken = useRef(0);

  const start = useCallback(
    async (mode: "dev" | "hero" = "hero") => {
      const token = ++runToken.current;
      const alive = () => runToken.current === token;
      const beat = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      // Close any stream still open from a previous run. Overwriting the handle
      // without this leaks an EventSource, and the orphan keeps pushing events
      // into the store for a relic nobody is looking at any more.
      unsubscribe.current?.();
      unsubscribe.current = null;

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

        /*
         * A cache hit arrives complete, and is paced anyway.
         *
         * This comment used to say the sequence still plays. It did not: the code
         * below it went straight to COMPLETE, so a cached relic skipped every
         * beat and the reveal simply appeared. Level one is fully cached, which
         * means the fight the most people see was the one that showed least of
         * what the game does.
         *
         * The beats are the product. A player has to watch the reading of their
         * fight turn into a design, the design turn into a drawing, and the
         * drawing turn into a weapon, or the weapon is just something the game
         * handed over. Roughly five seconds is enough to be a moment and short
         * enough that nobody waits.
         *
         * Deliberately not faked as progress: the percentage runs because a real
         * one does, but it is over in a couple of seconds rather than pretending
         * to take ninety.
         */
        if (relic.cached && relic.modelUrl) {
          await beat(700);
          if (!alive()) return;
          patchForge({ stage: "GENERATING_CONCEPT" });

          await beat(900);
          if (!alive()) return;
          patchForge({ conceptUrl: relic.conceptUrl, stage: "CONCEPT_READY" });

          await beat(1200);
          if (!alive()) return;
          patchForge({ stage: "FORGING_3D", meshPercent: 0 });

          for (const percent of [18, 44, 71, 93, 100]) {
            await beat(320);
            if (!alive()) return;
            patchForge({ meshPercent: percent });
          }

          await beat(400);
          if (!alive()) return;
          patchForge({
            modelUrl: relic.modelUrl,
            transform: relic.transform,
            totalMs: relic.totalMs,
            stage: "MODEL_READY",
          });

          await beat(900);
          if (!alive()) return;
          patchForge({ stage: "COMPLETE" });
          return;
        }

        startWatchdog(relic.relicId);

        unsubscribe.current = streamRelic(relic.relicId, (event) => {
          lastEventAt.current = performance.now();
          switch (event.type) {
            case "dna.ready":
              patchForge({ dna: event.dna, name: event.name, stage: "DNA_READY" });
              break;
            case "concept.generating":
              // Carries which candidate is being imagined, so a minute of work
              // is not a single motionless headline.
              patchForge({
                stage: "GENERATING_CONCEPT",
                conceptAttempt: event.index,
                conceptAttempts: event.total,
              });
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
              stopWatchdog();
              break;
            case "relic.failed":
              // The player sees "THE FORGE RESISTS", never a stack trace.
              patchForge({
                stage: "FAILED",
                error: event.retryable ? "retryable" : "fatal",
              });
              stopWatchdog();
              break;
          }
        });
      } catch (err) {
        patchForge({ stage: "FAILED", error: (err as Error).message });
        stopWatchdog();
      }
    },
    [patchForge, setPhase, startWatchdog, stopWatchdog],
  );

  /**
   * Retries a failed forge, reusing the same relic record so its DNA, prompt and
   * cache key are unchanged. Re-subscribes because the previous stream closed
   * when the failure arrived.
   */
  const retry = useCallback(async () => {
    const relicId = useGameStore.getState().forge.relicId;
    if (!relicId) return;

    unsubscribe.current?.();
    patchForge({ stage: "ANALYZING", error: null, meshPercent: 0 });

    try {
      await retryRelic(relicId);
      startWatchdog(relicId);
      unsubscribe.current = streamRelic(relicId, (event) => {
        lastEventAt.current = performance.now();
        switch (event.type) {
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
            patchForge({ stage: "FAILED", error: event.retryable ? "retryable" : "fatal" });
            break;
        }
      });
    } catch (err) {
      patchForge({ stage: "FAILED", error: (err as Error).message });
    }
  }, [patchForge, startWatchdog]);

  /** Persists the canonical transform so re-equipping is stable across reloads. */
  const persistTransform = useCallback((transform: RelicTransform) => {
    const relicId = useGameStore.getState().forge.relicId;
    if (relicId) void saveTransform(relicId, transform);
  }, []);

  return { start, retry, persistTransform };
}
