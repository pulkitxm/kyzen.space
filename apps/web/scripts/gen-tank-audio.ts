import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOUNDS_DIR = join(HERE, "..", "public", "sounds");
const SFX_DIR = join(SOUNDS_DIR, "tank-arena");
const RATE = 48000;
const TAU = Math.PI * 2;
const CEILING = 10 ** (-1.5 / 20);
const MUSIC_SEED = 7;
const LOUDNORM = "loudnorm=I=-14:TP=-1.5:LRA=11";
const OPUS = [
  "-ar 48000 -ac 2 -c:a libopus -b:a 64k -vbr on -compression_level 10",
  "-application audio -map_metadata -1 -fflags +bitexact -flags:a +bitexact",
]
  .join(" ")
  .split(" ");

type Stereo = { l: Float64Array; r: Float64Array; loop: boolean };
type Voice = (t: number) => number;
type Rand = () => number;

function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stereo(seconds: number, loop = false): Stereo {
  const frames = Math.round(seconds * RATE);
  return { l: new Float64Array(frames), r: new Float64Array(frames), loop };
}

function hz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function noise(rand: Rand): number {
  return rand() * 2 - 1;
}

function fall(t: number, from: number, to: number, tau: number): number {
  return to + (from - to) * Math.exp(-t / tau);
}

function hit(t: number, attack: number, decay: number): number {
  return t < attack ? t / attack : Math.exp(-(t - attack) / decay);
}

function gate(t: number, length: number, attack: number, release: number) {
  const tail = t < length ? 1 : Math.max(0, 1 - (t - length) / release);
  return Math.min(1, t / attack) * tail;
}

function blep(phase: number, step: number): number {
  if (phase < step) {
    const x = phase / step;
    return x + x - x * x - 1;
  }
  if (phase > 1 - step) {
    const x = (phase - 1) / step;
    return x * x + x + x + 1;
  }
  return 0;
}

function osc(shape: "sine" | "saw" | "square" | "triangle") {
  let phase = 0;
  return (freq: number) => {
    const step = freq / RATE;
    phase = (phase + step) % 1;
    if (shape === "sine") return Math.sin(TAU * phase);
    if (shape === "triangle") return 4 * Math.abs(phase - 0.5) - 1;
    if (shape === "saw") return 2 * phase - 1 - blep(phase, step);
    const square = phase < 0.5 ? 1 : -1;
    return square + blep(phase, step) - blep((phase + 0.5) % 1, step);
  };
}

function fm(ratio: number) {
  let carrier = 0;
  let modulator = 0;
  return (freq: number, index: number) => {
    carrier = (carrier + freq / RATE) % 1;
    modulator = (modulator + (freq * ratio) / RATE) % 1;
    return Math.sin(TAU * carrier + index * Math.sin(TAU * modulator));
  };
}

function svf(mode: "low" | "band" | "high") {
  let s1 = 0;
  let s2 = 0;
  return (x: number, cutoff: number, q: number) => {
    const g = Math.tan((Math.PI * Math.min(cutoff, RATE * 0.45)) / RATE);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const v1 = a1 * s1 + g * a1 * (x - s2);
    const v2 = s2 + g * v1;
    s1 = 2 * v1 - s1;
    s2 = 2 * v2 - s2;
    if (mode === "low") return v2;
    return mode === "band" ? v1 : x - k * v1 - v2;
  };
}

const METAL_RATIOS = [1, 2.76, 5.4, 8.93];

function metal(f0: number, decay: number): Voice {
  return (t) => {
    let total = 0;
    METAL_RATIOS.forEach((ratio, k) => {
      const partial = Math.sin(TAU * f0 * ratio * t);
      total += (partial * Math.exp((-t * (k + 1)) / decay)) / (k + 1);
    });
    return total;
  };
}

function mix(out: Stereo, at: number, len: number, pan: number, v: Voice) {
  const frames = out.l.length;
  const start = Math.round(at * RATE);
  const left = Math.cos(((pan + 1) * Math.PI) / 4);
  const right = Math.sin(((pan + 1) * Math.PI) / 4);
  const length = Math.round(len * RATE);
  for (let i = 0; i < length; i++) {
    const j = start + i;
    if (j >= frames && !out.loop) return;
    const value = v(i / RATE);
    out.l[j % frames] += value * left;
    out.r[j % frames] += value * right;
  }
}

function effect(
  input: Stereo,
  make: (channel: number) => (x: number, i: number) => number,
): Stereo {
  const out = stereo(input.l.length / RATE, input.loop);
  [input.l, input.r].forEach((source, channel) => {
    const fx = make(channel);
    const target = channel === 0 ? out.l : out.r;
    for (let pass = input.loop ? 0 : 1; pass < 2; pass++)
      for (let i = 0; i < source.length; i++) target[i] = fx(source[i], i);
  });
  return out;
}

function comb(size: number, feedback: number, damp: number) {
  const ring = new Float64Array(size);
  let index = 0;
  let store = 0;
  return (x: number) => {
    const y = ring[index];
    store = y * (1 - damp) + store * damp;
    ring[index] = x + store * feedback;
    index = (index + 1) % size;
    return y;
  };
}

function allpass(size: number) {
  const ring = new Float64Array(size);
  let index = 0;
  return (x: number) => {
    const delayed = ring[index];
    ring[index] = x + delayed * 0.5;
    index = (index + 1) % size;
    return delayed - x;
  };
}

function reverb(input: Stereo, feedback: number, damp: number): Stereo {
  const scale = RATE / 44100;
  return effect(input, (channel) => {
    const size = (n: number) => Math.round((n + channel * 23) * scale);
    const combs = [1116, 1277, 1422, 1617].map((n) =>
      comb(size(n), feedback, damp),
    );
    const passes = [556, 341].map((n) => allpass(size(n)));
    return (x) => {
      let y = 0;
      for (const c of combs) y += c(x * 0.03);
      for (const a of passes) y = a(y);
      return y;
    };
  });
}

function echo(input: Stereo, steps: number[], feedback: number): Stereo {
  return effect(input, (channel) => {
    const ring = new Float64Array(Math.round(steps[channel] * STEP * RATE));
    const tone = svf("low");
    let index = 0;
    return (x) => {
      const delayed = ring[index];
      ring[index] = tone(x + delayed * feedback, 3500, 0.7);
      index = (index + 1) % ring.length;
      return delayed;
    };
  });
}

function sum(parts: [Stereo, number][]): Stereo {
  const [first] = parts[0];
  const out = stereo(first.l.length / RATE, first.loop);
  for (const [bus, gain] of parts)
    for (let i = 0; i < out.l.length; i++) {
      out.l[i] += bus.l[i] * gain;
      out.r[i] += bus.r[i] * gain;
    }
  return out;
}

function shape(s: Stereo, fn: (x: number, i: number) => number): Stereo {
  for (const ch of [s.l, s.r])
    for (let i = 0; i < ch.length; i++) ch[i] = fn(ch[i], i);
  return s;
}

function saturate(s: Stereo, drive: number): Stereo {
  return shape(s, (x) => Math.tanh(x * drive));
}

function peak(s: Stereo): number {
  let max = 0;
  for (const ch of [s.l, s.r])
    for (const x of ch) max = Math.max(max, Math.abs(x));
  return max;
}

const K_SHELF_B = [1.53512485958697, -2.69169618940638, 1.19839281085285];
const K_SHELF_A = [-1.69065929318241, 0.73248077421585];
const K_HIGHPASS_B = [1, -2, 1];
const K_HIGHPASS_A = [-1.99004745483398, 0.99007225036621];

function biquad(x: Float64Array, b: number[], a: number[]): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    y[i] = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y[i];
  }
  return y;
}

function kWeight(x: Float64Array): Float64Array {
  const shelf = biquad(x, K_SHELF_B, K_SHELF_A);
  return biquad(shelf, K_HIGHPASS_B, K_HIGHPASS_A);
}

function maxMomentaryLoudness(s: Stereo): number {
  const l = kWeight(s.l);
  const r = kWeight(s.r);
  const window = 0.4 * RATE;
  let best = 1e-12;
  for (let end = 0.1 * RATE; end < l.length + window; end += 0.1 * RATE) {
    let energy = 0;
    for (let i = Math.max(0, end - window); i < Math.min(end, l.length); i++)
      energy += l[i] * l[i] + r[i] * r[i];
    best = Math.max(best, energy / window);
  }
  return -0.691 + 10 * Math.log10(best);
}

function level(s: Stereo, lufs: number): Stereo {
  for (let pass = 0; pass < 4; pass++) {
    const gain = 10 ** ((lufs - maxMomentaryLoudness(s)) / 20);
    shape(s, (x) => CEILING * Math.tanh((x * gain) / CEILING));
  }
  return s;
}

function fire(rand: Rand): Stereo {
  const out = stereo(0.9);
  const thump = osc("sine");
  mix(out, 0, 0.9, 0, (t) => {
    return thump(fall(t, 192, 42, 0.03)) * hit(t, 0.002, 0.14);
  });
  for (const pan of [-0.4, 0.4]) {
    const crack = svf("band");
    mix(out, 0, 0.3, pan, (t) => {
      const snap = crack(noise(rand), 3200 - 4000 * t, 0.9);
      return snap * hit(t, 0.001, 0.03) * 1.6;
    });
  }
  const smoke = svf("low");
  mix(out, 0, 0.9, 0.1, (t) => {
    const haze = smoke(noise(rand), fall(t, 1340, 140, 0.12), 0.7);
    return haze * hit(t, 0.004, 0.2) * 1.4;
  });
  const breech = metal(380, 0.08);
  mix(out, 0.01, 0.5, -0.2, (t) => breech(t) * 0.25);
  return saturate(out, 1.8);
}

function explode(rand: Rand): Stereo {
  const out = stereo(1.8);
  const sub = osc("sine");
  mix(out, 0, 1.3, 0, (t) => sub(fall(t, 92, 32, 0.08)) * hit(t, 0.003, 0.35));
  const flash = svf("high");
  mix(out, 0, 0.1, 0, (t) => {
    return flash(noise(rand), 1800, 0.7) * hit(t, 0.0005, 0.012) * 0.8;
  });
  for (const pan of [-0.6, 0.6]) {
    const body = svf("low");
    mix(out, 0, 1.8, pan, (t) => {
      const blast = body(noise(rand), fall(t, 3980, 180, 0.09), 0.8);
      return blast * hit(t, 0.004, 0.3) * 1.6;
    });
    const rumble = svf("low");
    mix(out, 0.02, 1.78, pan, (t) => {
      return rumble(noise(rand), 120, 0.9) * hit(t, 0.08, 0.45) * 5;
    });
  }
  const debris = svf("band");
  mix(out, 0.05, 1.2, 0.2, (t) => {
    const spark = rand() < 0.012 * Math.exp(-t / 0.35) ? noise(rand) * 6 : 0;
    return debris(spark, 2600, 1.5) * 0.6;
  });
  return saturate(out, 1.5);
}

function jump(rand: Rand): Stereo {
  const out = stereo(0.6);
  const thump = osc("sine");
  mix(out, 0, 0.3, 0, (t) => {
    return thump(fall(t, 125, 55, 0.03)) * hit(t, 0.002, 0.07);
  });
  const spring = osc("triangle");
  mix(out, 0.01, 0.4, 0, (t) => {
    return spring(200 * 2 ** (t / 0.12)) * hit(t, 0.01, 0.09) * 0.45;
  });
  for (const pan of [-0.5, 0.5]) {
    const whoosh = svf("band");
    mix(out, 0, 0.6, pan, (t) => {
      const air = whoosh(noise(rand), 500 * 2 ** (t / 0.15), 1.6);
      return air * hit(t, 0.04, 0.12) * 1.2;
    });
  }
  return saturate(out, 1.2);
}

function land(rand: Rand): Stereo {
  const out = stereo(0.5);
  const thud = osc("sine");
  mix(out, 0, 0.5, 0, (t) => {
    return thud(fall(t, 98, 38, 0.025)) * hit(t, 0.002, 0.11);
  });
  const dust = svf("low");
  mix(out, 0, 0.4, 0.2, (t) => {
    const puff = dust(noise(rand), fall(t, 2300, 300, 0.02), 0.8);
    return puff * hit(t, 0.001, 0.06) * 1.2;
  });
  const clank = metal(190, 0.07);
  mix(out, 0.008, 0.45, -0.25, (t) => clank(t) * 0.3);
  return saturate(out, 1.4);
}

function shield(rand: Rand): Stereo {
  const out = stereo(0.8);
  for (const [pan, detune] of [
    [-0.6, 0.995],
    [0.6, 1.005],
  ] as const) {
    const tone = fm(1.5);
    mix(out, 0, 0.8, pan, (t) => {
      const freq = detune * (260 + 380 * (1 - Math.exp(-t / 0.12)));
      const shimmer = 0.75 + 0.25 * Math.sin(TAU * 14 * t);
      const ring = tone(freq, 1.8 * Math.exp(-t / 0.25) + 0.3);
      return ring * gate(t, 0.6, 0.03, 0.2) * shimmer * 0.5;
    });
  }
  const air = svf("high");
  mix(out, 0, 0.8, 0, (t) => {
    return air(noise(rand), 5000, 0.7) * hit(t, 0.15, 0.2) * 0.25;
  });
  const hum = osc("sine");
  mix(out, 0, 0.8, 0, (t) => hum(98) * gate(t, 0.55, 0.02, 0.2) * 0.35);
  return out;
}

function wall(rand: Rand): Stereo {
  const out = stereo(0.9);
  const slam = osc("sine");
  mix(out, 0, 0.5, 0, (t) => {
    return slam(fall(t, 130, 50, 0.02)) * hit(t, 0.002, 0.09);
  });
  const impact = svf("low");
  mix(out, 0, 0.3, 0, (t) => {
    return impact(noise(rand), 900, 0.8) * hit(t, 0.001, 0.04) * 1.2;
  });
  const panel = metal(240, 0.25);
  mix(out, 0.005, 0.85, 0.2, (t) => panel(t) * 0.3);
  for (const [pan, ratio] of [
    [-0.5, 1],
    [0.5, 1.5],
  ] as const) {
    const hum = osc("saw");
    const tone = svf("low");
    mix(out, 0, 0.9, pan, (t) => {
      const tremolo = 0.7 + 0.3 * Math.sin(TAU * 18 * t);
      const buzz = tone(hum(ratio * (104 + 8 * t)), 900, 1.2);
      return buzz * gate(t, 0.6, 0.03, 0.27) * tremolo * 0.35;
    });
  }
  return saturate(out, 1.3);
}

function cluster(rand: Rand): Stereo {
  const out = stereo(0.8);
  const pop = svf("band");
  mix(out, 0, 0.15, 0, (t) => {
    return pop(noise(rand), 1500, 1.2) * hit(t, 0.001, 0.02) * 1.5;
  });
  const thump = osc("sine");
  mix(out, 0, 0.2, 0, (t) => {
    return thump(fall(t, 340, 140, 0.02)) * hit(t, 0.002, 0.05) * 0.6;
  });
  [-0.8, -0.4, 0, 0.4, 0.8].forEach((pan, k) => {
    const at = 0.02 + k * 0.03;
    const eject = svf("band");
    mix(out, at, 0.1, pan, (t) => {
      return eject(noise(rand), 3000, 1) * hit(t, 0.001, 0.015) * 0.6;
    });
    const whistle = osc("sine");
    const start = 1700 + rand() * 400 - k * 60;
    mix(out, at, 0.6, pan, (t) => {
      return whistle(start * 2 ** (-t / 0.25)) * hit(t, 0.004, 0.1) * 0.3;
    });
  });
  return saturate(out, 1.4);
}

function mine(rand: Rand): Stereo {
  const out = stereo(1.1);
  const beep = osc("square");
  const beepTone = svf("low");
  mix(out, 0, 0.06, 0, (t) => {
    const chirp = beepTone(beep(1760), 4000, 0.7);
    return chirp * gate(t, 0.045, 0.002, 0.01) * 0.25;
  });
  const sub = osc("sine");
  mix(out, 0.05, 1.05, 0, (t) => {
    return sub(fall(t, 130, 40, 0.03)) * hit(t, 0.002, 0.18);
  });
  for (const pan of [-0.5, 0.5]) {
    const body = svf("low");
    mix(out, 0.05, 1.05, pan, (t) => {
      const blast = body(noise(rand), fall(t, 6250, 250, 0.05), 0.9);
      return blast * hit(t, 0.001, 0.2) * 1.3;
    });
  }
  const shrapnel = metal(870, 0.12);
  mix(out, 0.055, 0.6, 0.3, (t) => shrapnel(t) * 0.18);
  return saturate(out, 1.7);
}

function pickup(): Stereo {
  const out = stereo(0.7);
  [76, 81, 85, 88].forEach((note, k) => {
    const chime = fm(2);
    const at = k * 0.055;
    mix(out, at, 0.7 - at, -0.45 + k * 0.3, (t) => {
      const ring = chime(hz(note), 1.2 * Math.exp(-t / 0.08));
      return ring * hit(t, 0.003, 0.16) * 0.4;
    });
  });
  return out;
}

function portal(rand: Rand): Stereo {
  const out = stereo(0.8);
  for (const [pan, sign] of [
    [-1, 1],
    [1, -1],
  ] as const) {
    const swirl = fm(0.5);
    const air = svf("band");
    mix(out, 0, 0.8, pan, (t) => {
      const arc = Math.sin((Math.PI * t) / 0.8);
      const sway = 0.55 + 0.45 * sign * Math.sin(TAU * 6 * t);
      const tone = swirl(220 * 2 ** (2.2 * arc), 2.5) * 0.35;
      const wind = air(noise(rand), 400 * 2 ** (3.3 * arc), 3) * 0.8;
      return (tone + wind) * gate(t, 0.6, 0.03, 0.2) * sway;
    });
  }
  return out;
}

function lock(rand: Rand): Stereo {
  const out = stereo(0.25);
  const click = svf("high");
  mix(out, 0, 0.03, 0, (t) => {
    return click(noise(rand), 2500, 0.7) * hit(t, 0.0005, 0.004);
  });
  [84, 91].forEach((note, k) => {
    const tone = fm(1);
    const at = 0.012 + k * 0.06;
    mix(out, at, 0.25 - at, 0, (t) => {
      const ring = tone(hz(note), 0.8 * Math.exp(-t / 0.03));
      return ring * hit(t, 0.002, 0.045) * 0.5;
    });
  });
  return out;
}

function tick(rand: Rand): Stereo {
  const out = stereo(0.12);
  const low = osc("sine");
  const high = osc("sine");
  mix(out, 0, 0.12, 0, (t) => {
    return (low(2093) * 0.6 + high(3520) * 0.3) * hit(t, 0.0008, 0.018);
  });
  const click = svf("band");
  mix(out, 0, 0.05, 0, (t) => {
    return click(noise(rand), 5000, 1.5) * hit(t, 0.0003, 0.004) * 0.8;
  });
  return out;
}

function siren(): Stereo {
  const out = stereo(2);
  for (const [pan, detune] of [
    [-0.5, 0.997],
    [0.5, 1.003],
  ] as const) {
    const horn = osc("saw");
    const body = osc("square");
    const tone = svf("low");
    mix(out, 0, 2, pan, (t) => {
      const wail = 0.5 - 0.5 * Math.cos(TAU * t);
      const vibrato = 1 + 0.006 * Math.sin(TAU * 7 * t);
      const freq = detune * (430 + 300 * wail) * vibrato;
      const raw = horn(freq) * 0.6 + body(freq * 0.5) * 0.4;
      return tone(raw, 2200, 0.9) * gate(t, 1.75, 0.08, 0.25) * 0.4;
    });
  }
  return saturate(out, 1.2);
}

function splash(rand: Rand): Stereo {
  const out = stereo(1);
  const thump = osc("sine");
  mix(out, 0, 0.3, 0, (t) => {
    return thump(fall(t, 150, 60, 0.03)) * hit(t, 0.002, 0.06) * 0.6;
  });
  for (const pan of [-0.5, 0.5]) {
    const spray = svf("band");
    mix(out, 0, 0.9, pan, (t) => {
      const mist = spray(noise(rand), fall(t, 3100, 1300, 0.15), 0.8);
      return mist * hit(t, 0.008, 0.18) * 1.1;
    });
  }
  for (let k = 0; k < 14; k++) {
    const bubble = osc("sine");
    const f0 = 450 + rand() * 900;
    const at = 0.06 + rand() * 0.6;
    const pan = rand() * 1.6 - 0.8;
    const decay = 0.02 + rand() * 0.03;
    mix(out, at, 0.2, pan, (t) => {
      return bubble(f0 * (1 + 6 * t)) * hit(t, 0.002, decay) * 0.18;
    });
  }
  return saturate(out, 1.2);
}

function select(): Stereo {
  const out = stereo(0.4);
  const chunk = osc("sine");
  mix(out, 0, 0.2, 0, (t) => {
    return chunk(fall(t, 210, 90, 0.015)) * hit(t, 0.001, 0.04) * 0.8;
  });
  const latch = metal(330, 0.05);
  mix(out, 0.004, 0.25, 0.2, (t) => latch(t) * 0.2);
  [79, 86].forEach((note, k) => {
    const tone = osc("triangle");
    const at = 0.03 + k * 0.07;
    mix(out, at, 0.4 - at, -0.2 + k * 0.4, (t) => {
      return tone(hz(note)) * hit(t, 0.003, 0.08) * 0.35;
    });
  });
  return out;
}

const IMPACT = -15;
const ACTION = -18;
const INTERFACE = -22;

type Sfx = {
  name: string;
  seed: number;
  lufs: number;
  make: (rand: Rand) => Stereo;
};

const SFX: Sfx[] = [
  { name: "fire", seed: 11, lufs: IMPACT, make: fire },
  { name: "explode", seed: 12, lufs: IMPACT, make: explode },
  { name: "jump", seed: 13, lufs: ACTION, make: jump },
  { name: "land", seed: 14, lufs: ACTION, make: land },
  { name: "shield", seed: 15, lufs: ACTION, make: shield },
  { name: "wall", seed: 16, lufs: ACTION, make: wall },
  { name: "cluster", seed: 17, lufs: IMPACT, make: cluster },
  { name: "mine", seed: 18, lufs: IMPACT, make: mine },
  { name: "pickup", seed: 19, lufs: ACTION, make: pickup },
  { name: "portal", seed: 20, lufs: ACTION, make: portal },
  { name: "lock", seed: 21, lufs: INTERFACE, make: lock },
  { name: "tick", seed: 22, lufs: INTERFACE, make: tick },
  { name: "siren", seed: 23, lufs: ACTION, make: siren },
  { name: "splash", seed: 24, lufs: ACTION, make: splash },
  { name: "select", seed: 25, lufs: INTERFACE, make: select },
];

const BPM = 112.5;
const STEP = 15 / BPM;
const SECTION_BARS = 8;
const PAD_RELEASE = 1;

const CHORDS = {
  Dm: { bass: 38, pad: [50, 53, 57, 64] },
  Bb: { bass: 34, pad: [50, 53, 57, 60] },
  F: { bass: 41, pad: [53, 57, 60, 64] },
  C: { bass: 36, pad: [48, 55, 62, 64] },
  Gm: { bass: 43, pad: [50, 53, 57, 58] },
  Asus: { bass: 45, pad: [50, 55, 57, 64] },
  A: { bass: 45, pad: [49, 52, 57, 64] },
};
type Chord = keyof typeof CHORDS;

const HOME: Chord[] = ["Dm", "Dm", "Bb", "Bb", "F", "F", "C", "C"];
const TURN: Chord[] = ["Gm", "Gm", "Bb", "Bb", "Dm", "Dm", "Asus", "A"];

type Section = {
  prog: Chord[];
  beat: "none" | "light" | "full" | "build";
  bass: "held" | "pulse" | "drive";
  arp: [number, number];
  bells?: true;
};

const SECTIONS: Section[] = [
  { prog: HOME, beat: "light", bass: "pulse", arp: [0.3, 0.4] },
  { prog: HOME, beat: "full", bass: "drive", arp: [0.5, 0.65] },
  { prog: HOME, beat: "full", bass: "drive", arp: [0.7, 0.8], bells: true },
  { prog: TURN, beat: "full", bass: "drive", arp: [0.8, 0.85], bells: true },
  { prog: HOME, beat: "none", bass: "held", arp: [0.45, 0.55], bells: true },
  { prog: TURN, beat: "build", bass: "pulse", arp: [0.35, 0.9] },
  { prog: HOME, beat: "full", bass: "drive", arp: [0.85, 0.95], bells: true },
  { prog: HOME, beat: "full", bass: "drive", arp: [0.75, 0.6], bells: true },
  { prog: TURN, beat: "light", bass: "pulse", arp: [0.5, 0.3] },
];

const ARP_PATTERNS = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [0, 2, 4, 6, 7, 5, 3, 1],
  [0, 4, 1, 5, 2, 6, 3, 7],
  [0, 3, 1, 4, 2, 5, 7, 6],
];

function pad(out: Stereo, at: number, len: number, notes: number[]) {
  for (const note of notes)
    for (const [pan, cents] of [
      [-0.8, -9],
      [0.8, 9],
    ] as const) {
      const wide = osc("saw");
      const center = osc("saw");
      const fWide = hz(note) * 2 ** (cents / 1200);
      const fCenter = hz(note) * 2 ** (cents / 3600);
      mix(out, at, len + PAD_RELEASE, pan, (t) => {
        const env = gate(t, len, 0.6, PAD_RELEASE);
        return (wide(fWide) + 0.6 * center(fCenter)) * env * 0.055;
      });
    }
}

function glass(out: Stereo, at: number, len: number, note: number) {
  const shine = osc("sine");
  const freq = hz(note);
  mix(out, at, len + PAD_RELEASE, 0.3, (t) => {
    const swell = 0.6 + 0.4 * Math.sin(TAU * 0.5 * t);
    return shine(freq) * gate(t, len, 1.2, PAD_RELEASE) * swell * 0.035;
  });
}

function bassNote(
  out: Stereo,
  at: number,
  len: number,
  note: number,
  k: number,
) {
  const saw = osc("saw");
  const sub = osc("sine");
  const tone = svf("low");
  const freq = hz(note);
  mix(out, at, len + 0.05, 0, (t) => {
    const raw = 0.55 * saw(freq) + 0.6 * sub(freq);
    const cutoff = 180 + k * 1400 * Math.exp(-t / 0.08);
    return tone(raw, cutoff, 1.6) * gate(t, len, 0.004, 0.05) * 0.36;
  });
}

function arpNote(
  out: Stereo,
  at: number,
  note: number,
  k: number,
  pan: number,
) {
  const pulse = osc("square");
  const saw = osc("saw");
  const tone = svf("low");
  const freq = hz(note);
  const cutoff = 300 * 2 ** (k * 4.4);
  mix(out, at, 0.3, pan, (t) => {
    const raw = 0.5 * pulse(freq) + 0.5 * saw(freq * 1.004);
    const sweep = cutoff * (1 + 2 * Math.exp(-t / 0.04));
    return tone(raw, sweep, 2.2) * hit(t, 0.002, 0.11) * 0.2;
  });
}

function bell(out: Stereo, at: number, note: number, pan: number) {
  const voice = fm(3.5);
  const freq = hz(note);
  mix(out, at, 2, pan, (t) => {
    return voice(freq, 2 * Math.exp(-t / 0.15)) * hit(t, 0.002, 0.7) * 0.13;
  });
}

function kick(out: Stereo, duck: Float64Array, at: number) {
  const body = osc("sine");
  mix(out, at, 0.45, 0, (t) => {
    const click = 0.15 * Math.sin(TAU * 1800 * t) * Math.exp(-t / 0.003);
    const tone = body(fall(t, 160, 50, 0.032)) + click;
    return tone * hit(t, 0.0015, 0.16) * 0.65;
  });
  const start = Math.round(at * RATE);
  for (let i = 0; i < 0.45 * RATE; i++) {
    const j = (start + i) % duck.length;
    duck[j] = Math.min(duck[j], 1 - 0.45 * hit(i / RATE, 0.004, 0.09));
  }
}

function clap(out: Stereo, at: number, gain: number, rand: Rand) {
  const tone = svf("band");
  mix(out, at, 0.35, 0.05, (t) => {
    const flutter = Math.exp(-(t % 0.01) / 0.003);
    const env = t < 0.03 ? flutter : Math.exp(-(t - 0.03) / 0.09);
    return tone(noise(rand), 1300, 1.1) * env * gain;
  });
}

function hat(out: Stereo, at: number, gain: number, open: boolean, rand: Rand) {
  const tone = svf("high");
  const decay = open ? 0.06 : 0.018;
  mix(out, at, open ? 0.25 : 0.08, 0.15, (t) => {
    return tone(noise(rand), 7500, 0.8) * hit(t, 0.001, decay) * gain;
  });
}

function clank(out: Stereo, at: number, decay: number, rand: Rand) {
  const ring = metal([311, 370, 415][Math.floor(rand() * 3)], decay);
  const gain = decay > 0.5 ? 0.08 : 0.12;
  mix(out, at, decay * 5, -0.3, (t) => ring(t) * gain);
}

function riser(out: Stereo, at: number, seconds: number, rand: Rand) {
  const sweep = svf("band");
  mix(out, at, seconds, 0, (t) => {
    const cutoff = 300 * 2 ** ((4 * t) / seconds);
    return sweep(noise(rand), cutoff, 2) * (t / seconds) ** 2 * 0.25;
  });
}

function music(rand: Rand): Stereo {
  const bars = SECTIONS.length * SECTION_BARS;
  const bar16 = (bar: number, step: number) => (bar * 16 + step) * STEP;
  const bus = () => stereo(bar16(bars, 0), true);
  const [drums, perc, bass, pads, arp, bells] = Array.from({ length: 6 }, bus);
  const duck = new Float64Array(drums.l.length).fill(1);
  const chordAt = (bar: number) =>
    SECTIONS[Math.floor(bar / SECTION_BARS)].prog[bar % SECTION_BARS];

  for (let bar = 0; bar < bars; ) {
    let length = 1;
    while (bar + length < bars && chordAt(bar + length) === chordAt(bar))
      length++;
    const notes = CHORDS[chordAt(bar)].pad;
    pad(pads, bar16(bar, 0), bar16(length, 0), notes);
    glass(bells, bar16(bar, 0), bar16(length, 0), Math.max(...notes) + 12);
    bar += length;
  }

  SECTIONS.forEach((section, index) => {
    const pattern = ARP_PATTERNS[Math.floor(rand() * ARP_PATTERNS.length)];
    const rests = Array.from(
      { length: 16 },
      (_, step) => step % 4 !== 0 && rand() < 0.2,
    );
    for (let b = 0; b < SECTION_BARS; b++) {
      const bar = index * SECTION_BARS + b;
      const chord = CHORDS[chordAt(bar)];
      const at = (step: number) => bar16(bar, step);
      const tones = [12, 24].flatMap((up) => chord.pad.map((n) => n + up));
      const [from, to] = section.arp;

      for (let step = 0; step < 16; step++) {
        if (rests[step]) continue;
        const progress = (b * 16 + step) / (SECTION_BARS * 16);
        const bright = from + (to - from) * progress;
        const note = tones[pattern[step % 8]];
        arpNote(arp, at(step), note, bright, step % 2 ? 0.3 : -0.3);
      }

      if (section.bass === "held")
        bassNote(bass, at(0), 15 * STEP, chord.bass, 0.1);
      if (section.bass === "pulse")
        for (const step of [0, 4, 8, 12])
          bassNote(bass, at(step), 3 * STEP, chord.bass, 0.6);
      if (section.bass === "drive")
        for (let step = 0; step < 16; step += 2) {
          const octave = step % 8 === 6 ? 12 : 0;
          const accent = step % 4 ? 0.6 : 1;
          bassNote(bass, at(step), 1.6 * STEP, chord.bass + octave, accent);
        }

      if (section.bells)
        for (const step of [0, 3, 6, 10, 12]) {
          if (rand() >= 0.35) continue;
          const note = chord.pad[Math.floor(rand() * 4)] + 24;
          bell(bells, at(step), note, rand() - 0.5);
        }

      if (section.beat === "none") {
        if (b % 2 === 0) clank(perc, at(0), 0.9, rand);
        continue;
      }
      const building = section.beat === "build";
      const full = section.beat === "full" || (building && b >= 4);
      const light = section.beat === "light";
      for (const step of full ? [0, 4, 8, 12] : light ? [0, 8] : [])
        kick(drums, duck, at(step));
      if (full) for (const step of [4, 12]) clap(perc, at(step), 0.3, rand);
      if (building && b === SECTION_BARS - 1)
        for (let step = 0; step < 16; step++)
          clap(perc, at(step), 0.04 + 0.2 * (step / 15), rand);
      if (building && b === 0) riser(perc, at(0), bar16(SECTION_BARS, 0), rand);
      for (let step = 0; step < 16; step++) {
        const offbeat = step % 4 === 2;
        if (full) {
          const gain = offbeat ? 0.17 : 0.085 * (0.7 + 0.3 * rand());
          hat(drums, at(step), gain, offbeat, rand);
        } else if (offbeat) hat(drums, at(step), 0.08, false, rand);
      }
      if (b % 2 === 1) clank(perc, at(full ? 7 : 10), 0.18, rand);
    }
  });

  const cycle = bar16(SECTION_BARS, 0) * RATE;
  const filtered = effect(pads, () => {
    const tone = svf("low");
    return (x, i) => {
      const lfo = 0.5 - 0.5 * Math.cos((TAU * i) / cycle);
      return tone(x, 1000 + 2200 * lfo, 0.9);
    };
  });
  shape(filtered, (x, i) => x * duck[i]);
  shape(bass, (x, i) => x * duck[i]);
  shape(arp, (x, i) => x * (0.5 + 0.5 * duck[i]));
  const sends = sum([
    [filtered, 0.35],
    [bells, 0.7],
    [arp, 0.2],
    [perc, 0.3],
  ]);
  const hall = reverb(sends, 0.86, 0.35);
  const echoes = echo(
    sum([
      [arp, 0.5],
      [bells, 0.3],
    ]),
    [3, 4],
    0.38,
  );
  const master = sum([
    [drums, 1],
    [perc, 1],
    [bass, 1],
    [filtered, 1],
    [arp, 1],
    [bells, 1],
    [hall, 0.6],
    [echoes, 0.35],
  ]);
  const gain = 1 / peak(master);
  return shape(master, (x) => Math.tanh(x * gain * 1.4) / Math.tanh(1.4));
}

function wav(s: Stereo): Uint8Array {
  const frames = s.l.length;
  const view = new DataView(new ArrayBuffer(44 + frames * 8));
  const text = (offset: number, value: string) => {
    for (let k = 0; k < value.length; k++)
      view.setUint8(offset + k, value.charCodeAt(k));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + frames * 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 8, true);
  view.setUint16(32, 8, true);
  view.setUint16(34, 32, true);
  text(36, "data");
  view.setUint32(40, frames * 8, true);
  for (let i = 0; i < frames; i++) {
    view.setFloat32(44 + i * 8, s.l[i], true);
    view.setFloat32(48 + i * 8, s.r[i], true);
  }
  return new Uint8Array(view.buffer);
}

async function ffmpeg(audio: Uint8Array, args: string[]): Promise<string> {
  const input = ["-hide_banner", "-y", "-f", "wav", "-i", "pipe:0"];
  const proc = Bun.spawn(["ffmpeg", ...input, ...args], {
    stdin: audio,
    stdout: "ignore",
    stderr: "pipe",
  });
  const log = await new Response(proc.stderr).text();
  if ((await proc.exited) !== 0) throw new Error(log);
  return log;
}

async function loudnorm(audio: Uint8Array): Promise<string> {
  const probe = [`${LOUDNORM}:print_format=json`, "-f", "null", "-"];
  const log = await ffmpeg(audio, ["-af", ...probe]);
  const json = log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1);
  const m: Record<string, string> = JSON.parse(json);
  return [
    LOUDNORM,
    `measured_I=${m.input_i}`,
    `measured_TP=${m.input_tp}`,
    `measured_LRA=${m.input_lra}`,
    `measured_thresh=${m.input_thresh}`,
    `offset=${m.target_offset}`,
    "linear=true",
  ].join(":");
}

async function encode(audio: Stereo, path: string, normalize: boolean) {
  const data = wav(audio);
  const filter = normalize ? ["-af", await loudnorm(data)] : [];
  await ffmpeg(data, [...filter, ...OPUS, path]);
  const seconds = (audio.l.length / RATE).toFixed(2);
  console.log(`${relative(SOUNDS_DIR, path)}: ${seconds} s`);
}

await mkdir(SFX_DIR, { recursive: true });
for (const { name, seed, lufs, make } of SFX) {
  const path = join(SFX_DIR, `${name}.ogg`);
  await encode(level(make(mulberry32(seed)), lufs), path, false);
}
const bg = music(mulberry32(MUSIC_SEED));
await encode(bg, join(SOUNDS_DIR, "tank-arena-bg.ogg"), true);
