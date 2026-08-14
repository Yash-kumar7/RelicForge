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
    master.gain.value = 0.5;
    master.connect(context.destination);
  }
  // Browsers start the context suspended until a user gesture.
  if (context.state === "suspended") void context.resume();
  return context;
}

export function unlockAudio(): void {
  void ctx();
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

function tone({ frequency, duration, type = "sine", gain = 0.3, sweepTo, delay = 0 }: ToneOptions) {
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

export const sfx = {
  swingLight: () => {
    noise(0.16, 0.14, 2600);
    tone({ frequency: 420, sweepTo: 180, duration: 0.14, type: "triangle", gain: 0.1 });
  },

  swingHeavy: () => {
    noise(0.3, 0.2, 1400);
    tone({ frequency: 180, sweepTo: 60, duration: 0.32, type: "sawtooth", gain: 0.16 });
  },

  hitBoss: () => {
    tone({ frequency: 160, sweepTo: 70, duration: 0.2, type: "square", gain: 0.18 });
    noise(0.12, 0.22, 3200);
  },

  playerHurt: () => {
    tone({ frequency: 110, sweepTo: 48, duration: 0.5, type: "sawtooth", gain: 0.24 });
  },

  dodge: () => {
    noise(0.22, 0.1, 5200);
  },

  bossDeath: () => {
    tone({ frequency: 90, sweepTo: 28, duration: 2.2, type: "sawtooth", gain: 0.3 });
    noise(1.8, 0.16, 700);
  },

  /** Forge ignition, the arena has just gone quiet and dark. */
  forgeIgnite: () => {
    tone({ frequency: 48, sweepTo: 130, duration: 2.4, type: "sine", gain: 0.3 });
    noise(2.2, 0.12, 500);
    tone({ frequency: 320, duration: 1.6, type: "triangle", gain: 0.06, delay: 0.4 });
  },

  /** One hammer strike; the sequence calls this on a loop while forging. */
  hammer: () => {
    tone({ frequency: 240, sweepTo: 90, duration: 0.28, type: "square", gain: 0.16 });
    noise(0.2, 0.16, 2200);
  },

  conceptReveal: () => {
    tone({ frequency: 660, duration: 1.1, type: "sine", gain: 0.12 });
    tone({ frequency: 990, duration: 1.3, type: "sine", gain: 0.08, delay: 0.06 });
  },

  /** The weapon materializes. This is the moment the whole project builds to. */
  relicReveal: () => {
    tone({ frequency: 130, sweepTo: 520, duration: 1.4, type: "sawtooth", gain: 0.22 });
    tone({ frequency: 523, duration: 2.4, type: "sine", gain: 0.16, delay: 0.25 });
    tone({ frequency: 784, duration: 2.2, type: "sine", gain: 0.12, delay: 0.35 });
    tone({ frequency: 1046, duration: 2.0, type: "sine", gain: 0.09, delay: 0.45 });
    noise(0.5, 0.2, 4000);
  },

  equip: () => {
    tone({ frequency: 300, sweepTo: 140, duration: 0.24, type: "square", gain: 0.18 });
    noise(0.16, 0.14, 2800);
  },

  defeat: () => {
    tone({ frequency: 140, sweepTo: 40, duration: 2.6, type: "sine", gain: 0.26 });
  },
};
