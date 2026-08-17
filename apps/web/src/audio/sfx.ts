/**
 * Sound, synthesized at runtime.
 *
 * Every cue here is generated with oscillators and noise buffers rather than
 * loaded from files. That keeps the repo free of binary assets and licensing
 * questions, and audio matters disproportionately for how finished the forge
 * reveal feels, a silent reveal reads as a tech demo.
 */

let context: AudioContext | null = null;
let master: GainNode | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();

    /*
     * Everything is louder, and a limiter is what makes that safe.
     *
     * The master sat at 0.5 and every cue was written under it, so the whole
     * game played about a stop below where it should: a hover reached -38 dBFS
     * and a sword landing reached -16, on laptop speakers, against a browser at
     * whatever volume the machine happens to be at. It read as sound that was
     * not working rather than sound that was tasteful.
     *
     * Raising the master alone would clip, because cues overlap constantly: a
     * heavy swing lands while the boss is telegraphing while embers are playing.
     * A compressor on the output catches those peaks instead, which is what a
     * game mix does, so the quiet things can come up without the loud moments
     * distorting.
     */
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.16;

    master.gain.value = 1;
    master.connect(limiter);
    limiter.connect(context.destination);
  }
  // Browsers start the context suspended until a user gesture.
  if (context.state === "suspended") void context.resume();
  return context;
}

export function unlockAudio(): void {
  void ctx();
}

/**
 * Runs a cue once the context is actually running.
 *
 * Browsers start an AudioContext suspended and resume() is asynchronous, so a
 * sound asked for in the same gesture that unlocks the audio is scheduled
 * against a clock that is not moving yet and is simply lost. On every screen
 * after the first that is invisible, because something has already woken the
 * context. On the first screen it is the whole experience: the title screen has
 * exactly one button, so its click is usually the first gesture of the session,
 * and it was the one press guaranteed to be silent.
 *
 * A resume takes a few milliseconds, which is inside the window where a sound
 * still reads as belonging to the press that caused it.
 */
function whenRunning(play: () => void): void {
  const audio = ctx();
  if (!audio || !master) return;
  if (audio.state === "running") {
    play();
    return;
  }
  void audio.resume().then(play, () => {
    /* An autoplay policy refused it. The interface is silent, not broken. */
  });
}

/**
 * Dips everything for a moment, so an impact owns the frame it lands in.
 *
 * Sidechain ducking, which is what a mix does when one sound has to be the only
 * thing that matters for a tenth of a second. Without it a heavy landing competes
 * with the drone, the embers and its own whoosh, and arrives smaller than the
 * screen shake happening beside it.
 */
function duck(amount: number, ms: number): void {
  const audio = ctx();
  if (!audio || !master) return;
  const now = audio.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(amount, now + 0.012);
  master.gain.linearRampToValueAtTime(1, now + ms / 1000);
}

export function setVolume(value: number): void {
  if (master) master.gain.value = Math.max(0, Math.min(1, value));
}

interface ToneOptions {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Sweeps to this frequency across the duration. */
  sweepTo?: number;
  delay?: number;
}

function tone(options: ToneOptions) {
  whenRunning(() => emitTone(options));
}

function emitTone({ frequency, duration, type = "sine", gain = 0.3, sweepTo, delay = 0 }: ToneOptions) {
  const audio = ctx();
  if (!audio || !master) return;

  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const env = audio.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), start + duration);

  // Percussive envelope: fast attack, exponential tail. Linear fades click.
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(env);
  env.connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function noise(duration: number, gain = 0.2, filterHz = 1200, delay = 0) {
  whenRunning(() => emitNoise(duration, gain, filterHz, delay));
}

function emitNoise(duration: number, gain: number, filterHz: number, delay: number) {
  const audio = ctx();
  if (!audio || !master) return;

  const start = audio.currentTime + delay;
  const frames = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const source = audio.createBufferSource();
  source.buffer = buffer;

  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterHz;

  const env = audio.createGain();
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter);
  filter.connect(env);
  env.connect(master);
  source.start(start);
}

/**
 * Interface sounds, which the game had none of.
 *
 * Every sound in here answered something happening in the arena, and the three
 * screens before it were silent: a champion could be chosen, a weapon equipped
 * and a boss picked without the game acknowledging any of it. A menu that makes
 * no sound reads as a menu that has not registered the click, which is why
 * players press things twice.
 *
 * Quiet, not inaudible, and the first pass got that wrong. Written to be
 * unobtrusive, they came out at a peak amplitude of 0.013 for a hover and 0.035
 * for a select once the master gain was applied: about -38 and -29 dBFS, on blips
 * of forty and seventy milliseconds. That is not restraint, it is silence with a
 * volume control attached, and it reads as sound that does not work.
 *
 * They now sit near the quiet end of the fight rather than far below it. Still
 * the smallest sounds in the game, still out of the way in a tenth of a second,
 * but present on laptop speakers, which is where this will be judged.
 *
 * There is no hover cue. It existed, and it fired on scroll: pointerover does not
 * care whether the cursor moved or the page did, so a column of buttons passing a
 * resting pointer rattled. A press is unambiguous and needs no guarding.
 *
 * They belong to the same family as the rest: struck metal, not a chime. Two
 * partials a fifth apart, low and short, so the interface sounds like the forge
 * it is attached to rather than like an operating system.
 */
const UI = {
  /** Picking one thing out of several. */
  select: () => {
    tone({ frequency: 520, duration: 0.09, type: "triangle", gain: 0.24 });
    tone({ frequency: 780, duration: 0.07, type: "sine", gain: 0.13, delay: 0.012 });
  },

  /** Committing: continue, descend, claim. Lower and longer than a select. */
  confirm: () => {
    tone({ frequency: 300, sweepTo: 450, duration: 0.2, type: "triangle", gain: 0.34 });
    tone({ frequency: 600, duration: 0.14, type: "sine", gain: 0.16, delay: 0.02 });
    noise(0.1, 0.09, 3200);
  },

  /** Going back, or closing something. The confirm, inverted. */
  back: () => {
    tone({ frequency: 420, sweepTo: 260, duration: 0.15, type: "triangle", gain: 0.22 });
  },

  /** Pressing something that cannot be pressed yet. */
  denied: () => {
    tone({ frequency: 150, duration: 0.11, type: "square", gain: 0.27 });
  },
} as const;

/**
 * A room tone for the screens outside the fight.
 *
 * The title screen shows a forge and makes no sound at all, which is the one
 * place a game is allowed to set a mood before asking anything of the player.
 * There is nothing to ask permission for, either: browsers have no audio
 * permission, only a rule that nothing plays before a gesture, and no dialog
 * waives it. So this starts on whatever the player does first and not before.
 *
 * Two detuned oscillators and a filtered noise bed, held very low. It is meant
 * to be noticed on leaving rather than on arriving: the test of a room tone is
 * that stopping it feels like something happened.
 */
let ambience: { stop: () => void } | null = null;

/**
 * One thing, and it is a forge.
 *
 * The first version was two: a pair of detuned oscillators held under a slow
 * minor arpeggio. Both were synthesized from bare waveforms, and that is what
 * they sounded like. A sustained sine is a test tone however low it is pitched,
 * the beating between the two detuned voices is the "uuuu" underneath
 * everything, and a melody made of triangle waves sits on top of it as a second,
 * unrelated instrument. Two cheap sounds do not add up to atmosphere; they add up
 * to two cheap sounds.
 *
 * What is left has no pitched material at all. Filtered noise is a room, because
 * that is physically what a room is, and a lowpass drifting slowly across it is
 * air moving over coals. The only events are the forge being worked, far enough
 * off to be someone else's work.
 *
 * The test is the same one as before: it should be noticed on leaving rather than
 * on arriving. A drone fails that by being audible as itself.
 */
const FORGE_BREATH_SECONDS = 11;

function buildAmbience(): void {
  if (ambience) return;
  const audio = ctx();
  if (!audio || !master) return;

  const bed = audio.createGain();
  bed.gain.setValueAtTime(0.0001, audio.currentTime);
  // Four seconds to arrive, so it is never the thing that made you look up.
  bed.gain.exponentialRampToValueAtTime(0.085, audio.currentTime + 4);
  bed.connect(master);

  /*
   * Four seconds of noise on a loop, filtered hard.
   *
   * Long enough that the loop point is not a rhythm, and the filter is doing the
   * work: everything above a couple of hundred hertz is hiss, and everything left
   * is the low roar of something burning.
   */
  const frames = Math.floor(audio.sampleRate * 4);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * 0.6;

  const coals = audio.createBufferSource();
  coals.buffer = buffer;
  coals.loop = true;

  /*
   * Bounded at both ends, which is the difference between a fire and a rocket.
   *
   * This was a lowpass alone, and a lowpass alone is not a band: everything below
   * the cutoff passes, so the loudest thing in the bed was sub-bass with no mid
   * above it. That is the exact spectrum of thrust. Fire lives in a band and
   * crackles over the top of it; a roar with the top cut off and nothing under it
   * held back is an engine, however quietly it is played.
   */
  const floorCut = audio.createBiquadFilter();
  floorCut.type = "highpass";
  floorCut.frequency.value = 60;

  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 150;
  filter.Q.value = 0.7;

  /*
   * The cutoff breathes, which is the whole difference between a fire and a
   * hiss. Held noise reads as static; noise that opens and closes reads as
   * something alive, and eleven seconds is slow enough that nobody counts it.
   */
  const breath = audio.createOscillator();
  breath.type = "sine";
  breath.frequency.value = 1 / FORGE_BREATH_SECONDS;
  const breathDepth = audio.createGain();
  /* Shallow. At 90 against a 180 cutoff this swept half the band every eleven
     seconds, which is a throttle, not a breath. */
  breathDepth.gain.value = 26;
  breath.connect(breathDepth);
  breathDepth.connect(filter.frequency);
  breath.start();

  coals.connect(floorCut);
  floorCut.connect(filter);
  filter.connect(bed);
  coals.start();

  /*
   * Embers, which is what makes the low end read as coals rather than exhaust.
   *
   * A burning thing is not continuous. The roar is the bed and the ear files any
   * steady roar as machinery until something irregular happens over the top.
   *
   * These get their own emitter rather than the shared noise() helper, because
   * that helper opens at full gain on the first sample. For an impact that is
   * correct and is most of why a hit lands. For a twelve-millisecond ambient tick
   * it is a step discontinuity in the waveform, which is the sound of a failing
   * speaker, and eleven a second of it is a fault rather than a fire.
   *
   * So: a four-millisecond attack, dark enough to be across a room, and spaced in
   * seconds rather than tenths.
   */
  const ember = () => {
    const now = audio.currentTime;
    const seconds = 0.03 + Math.random() * 0.04;
    const frames = Math.floor(audio.sampleRate * seconds);
    const pop = audio.createBuffer(1, frames, audio.sampleRate);
    const samples = pop.getChannelData(0);
    for (let i = 0; i < frames; i++) samples[i] = Math.random() * 2 - 1;

    const source = audio.createBufferSource();
    source.buffer = pop;

    const colour = audio.createBiquadFilter();
    colour.type = "lowpass";
    colour.frequency.value = 1500 + Math.random() * 700;

    const env = audio.createGain();
    const peak = 0.007 + Math.random() * 0.009;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(peak, now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

    source.connect(colour);
    colour.connect(env);
    env.connect(bed);
    source.start(now);
  };

  let emberTimer = 0;
  const scheduleEmber = () => {
    emberTimer = window.setTimeout(
      () => {
        ember();
        scheduleEmber();
      },
      700 + Math.random() * 2500,
    );
  };
  scheduleEmber();

  /*
   * Somebody working, in the next room.
   *
   * The only events in the whole ambience, and they are struck metal rather than
   * notes: a short ring with a body under it, quiet, and never on a beat. This is
   * the forge the page is about, so it should be heard being used.
   */
  const strike = () => {
    tone({ frequency: 430 + Math.random() * 90, duration: 0.5, type: "triangle", gain: 0.05 });
    tone({ frequency: 128, sweepTo: 96, duration: 0.4, type: "sine", gain: 0.07, delay: 0.005 });
    noise(0.06, 0.05, 2600);
  };

  let strikeTimer = 0;
  const scheduleStrike = () => {
    // Between four and eleven seconds, so the ear never predicts one.
    strikeTimer = window.setTimeout(() => {
      strike();
      scheduleStrike();
    }, 4000 + Math.random() * 7000);
  };
  scheduleStrike();

  ambience = {
    stop: () => {
      window.clearTimeout(strikeTimer);
      window.clearTimeout(emberTimer);
      const now = audio.currentTime;
      bed.gain.cancelScheduledValues(now);
      bed.gain.setValueAtTime(Math.max(0.0001, bed.gain.value), now);
      bed.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      // Stopped after the fade, or the tail is cut off mid-breath.
      window.setTimeout(() => {
        coals.stop();
        breath.stop();
      }, 1400);
    },
  };
}

/**
 * Starts the room tone, waiting for the context rather than giving up on it.
 *
 * This once checked whether the context was already running and returned if it
 * was not, which is exactly its state when called: the first gesture begins an
 * asynchronous resume and this ran a moment later. It gave up, and since the
 * unlock listener fires once, nothing ever asked again.
 */
export function startAmbience(): void {
  if (ambience) return;
  whenRunning(() => buildAmbience());
}

export function stopAmbience(): void {
  ambience?.stop();
  ambience = null;
}

export const sfx = {
  ...UI,

  swingLight: () => {
    noise(0.16, 0.21, 2600);
    tone({ frequency: 420, sweepTo: 180, duration: 0.14, type: "triangle", gain: 0.15 });
  },

  swingHeavy: () => {
    noise(0.3, 0.3, 1400);
    tone({ frequency: 180, sweepTo: 60, duration: 0.32, type: "sawtooth", gain: 0.24 });
  },

  /** Wind-up. Rising, so it reads as "about to happen" rather than "happened". */
  telegraph: () => {
    tone({ frequency: 90, sweepTo: 340, duration: 0.75, type: "sawtooth", gain: 0.24 });
    tone({ frequency: 180, sweepTo: 500, duration: 0.7, type: "triangle", gain: 0.12, delay: 0.05 });
  },

  /** The swing itself, distinct from the wind-up. */
  bossSwing: () => {
    noise(0.34, 0.36, 1100);
    tone({ frequency: 150, sweepTo: 46, duration: 0.36, type: "sawtooth", gain: 0.3 });
  },

  /**
   * An impact in three layers, which is how these are built.
   *
   * A transient, a body and a tail, each owning a different part of the
   * spectrum so they stack rather than compete: the bright metal on top, the
   * weight in the low mids, the rumble underneath. This was two layers in the
   * same octave and read as a click rather than as a blow landing.
   *
   * Light and heavy are different sounds rather than one sound at two volumes.
   * A player has to hear which attack they threw without looking at the number
   * that floated off the boss, and a heavy is the one that gets the sub and the
   * duck.
   */
  hitBoss: (kind: "light" | "heavy" = "light") => {
    if (kind === "heavy") {
      // Transient: the edge arriving. Short, bright, gone before it is heard.
      noise(0.045, 0.5, 7000);
      // Body: struck plate, and the part that says how heavy the weapon is.
      tone({ frequency: 190, sweepTo: 62, duration: 0.26, type: "square", gain: 0.34 });
      tone({ frequency: 96, sweepTo: 44, duration: 0.34, type: "sawtooth", gain: 0.26, delay: 0.01 });
      // Tail: the room answering, under everything else.
      noise(0.42, 0.16, 420, 0.03);
      tone({ frequency: 52, duration: 0.5, type: "sine", gain: 0.3, delay: 0.02 });
      duck(0.55, 150);
      return;
    }

    noise(0.03, 0.42, 8200);
    tone({ frequency: 320, sweepTo: 140, duration: 0.14, type: "square", gain: 0.26 });
    noise(0.18, 0.1, 900, 0.02);
  },

  /* Taking a hit is the one sound that must never be mistaken for landing one,
     so it is dull where an impact is bright: no transient, all body and tail. */
  playerHurt: () => {
    tone({ frequency: 110, sweepTo: 48, duration: 0.5, type: "sawtooth", gain: 0.36 });
    tone({ frequency: 58, duration: 0.6, type: "sine", gain: 0.32, delay: 0.01 });
    noise(0.3, 0.14, 500);
    duck(0.6, 180);
  },

  dodge: () => {
    noise(0.22, 0.15, 5200);
  },

  bossDeath: () => {
    tone({ frequency: 90, sweepTo: 28, duration: 2.2, type: "sawtooth", gain: 0.45 });
    noise(1.8, 0.24, 700);
  },

  /** Forge ignition, the arena has just gone quiet and dark. */
  forgeIgnite: () => {
    tone({ frequency: 48, sweepTo: 130, duration: 2.4, type: "sine", gain: 0.45 });
    noise(2.2, 0.18, 500);
    tone({ frequency: 320, duration: 1.6, type: "triangle", gain: 0.09, delay: 0.4 });
  },

  /** One hammer strike; the sequence calls this on a loop while forging. */
  hammer: () => {
    tone({ frequency: 240, sweepTo: 90, duration: 0.28, type: "square", gain: 0.24 });
    noise(0.2, 0.24, 2200);
  },

  conceptReveal: () => {
    tone({ frequency: 660, duration: 1.1, type: "sine", gain: 0.18 });
    tone({ frequency: 990, duration: 1.3, type: "sine", gain: 0.12, delay: 0.06 });
  },

  /** The weapon materializes. This is the moment the whole project builds to. */
  relicReveal: () => {
    tone({ frequency: 130, sweepTo: 520, duration: 1.4, type: "sawtooth", gain: 0.33 });
    tone({ frequency: 523, duration: 2.4, type: "sine", gain: 0.24, delay: 0.25 });
    tone({ frequency: 784, duration: 2.2, type: "sine", gain: 0.18, delay: 0.35 });
    tone({ frequency: 1046, duration: 2.0, type: "sine", gain: 0.135, delay: 0.45 });
    noise(0.5, 0.3, 4000);
  },

  equip: () => {
    tone({ frequency: 300, sweepTo: 140, duration: 0.24, type: "square", gain: 0.18 });
    noise(0.16, 0.14, 2800);
  },

  defeat: () => {
    tone({ frequency: 140, sweepTo: 40, duration: 2.6, type: "sine", gain: 0.26 });
  },
};
