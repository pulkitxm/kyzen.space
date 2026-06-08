import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  VOLUME_MAX,
  VOLUME_MIN,
  VOLUME_STEP,
} from "@gamelobby/shared/constants";

export function clampVolume(value: number): number {
  if (Number.isNaN(value)) return VOLUME_MIN;
  return Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, value));
}

export function stepVolume(value: number, direction: 1 | -1): number {
  const next = clampVolume(value) + direction * VOLUME_STEP;
  return clampVolume(Math.round(next * 100) / 100);
}

export type MusicState = {
  active: boolean;
  muted: boolean;
  volume: number;
  running: boolean;
};

export function shouldPlayMusic(state: MusicState): boolean {
  return state.active && !state.muted && state.volume > 0 && state.running;
}

type Tone = {
  type: OscillatorType;
  freq: number;
  duration: number;
};

const HOVER_TONE: Tone = { type: "triangle", freq: 600, duration: 0.05 };
const TOUCH_TONE: Tone = { type: "square", freq: 800, duration: 0.1 };
const DRAW_TONE: Tone = { type: "sawtooth", freq: 300, duration: 0.5 };

const WIN_SEQUENCE: { freq: number; offset: number; duration: number }[] = [
  { freq: 523.25, offset: 0, duration: 0.2 },
  { freq: 659.25, offset: 0.1, duration: 0.2 },
  { freq: 783.99, offset: 0.2, duration: 0.2 },
  { freq: 1046.5, offset: 0.3, duration: 0.4 },
];

const SFX_PEAK_GAIN = 0.3;
const SFX_FLOOR_GAIN = 0.01;

const MUSIC_STEP_S = 0.5;
const MUSIC_LOOKAHEAD_S = 0.15;
const MUSIC_TIMER_MS = 40;
const MUSIC_NOTE_GAIN = 0.12;
const MUSIC_NOTES_PER_CHORD = 4;

const MUSIC_PROGRESSION: number[][] = [
  [261.63, 329.63, 392.0, 329.63],
  [392.0, 493.88, 587.33, 493.88],
  [220.0, 277.18, 329.63, 277.18],
  [349.23, 440.0, 523.25, 440.0],
];

export class GameAudioEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxVolume = DEFAULT_SFX_VOLUME;
  private sfxMuted = false;
  private musicVolume = DEFAULT_MUSIC_VOLUME;
  private musicMuted = false;
  private musicActive = false;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicMuted ? 0 : this.musicVolume;
      this.musicGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    this.reconcileMusic();
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = clampVolume(volume);
  }

  setSfxMuted(muted: boolean): void {
    this.sfxMuted = muted;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = clampVolume(volume);
    this.reconcileMusic();
  }

  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    this.reconcileMusic();
  }

  setMusicActive(active: boolean): void {
    this.musicActive = active;
    this.reconcileMusic();
  }

  playHover(): void {
    this.playTone(HOVER_TONE);
  }

  playTouch(): void {
    this.playTone(TOUCH_TONE);
  }

  playDraw(): void {
    this.playTone(DRAW_TONE);
  }

  playWin(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.sfxMuted || this.sfxVolume <= 0) return;
    if (ctx.state === "suspended") void ctx.resume();
    for (const note of WIN_SEQUENCE) {
      this.scheduleTone(
        "sine",
        note.freq,
        ctx.currentTime + note.offset,
        note.duration,
      );
    }
  }

  private playTone(tone: Tone): void {
    const ctx = this.ensureContext();
    if (!ctx || this.sfxMuted || this.sfxVolume <= 0) return;
    if (ctx.state === "suspended") void ctx.resume();
    this.scheduleTone(tone.type, tone.freq, ctx.currentTime, tone.duration);
  }

  private scheduleTone(
    type: OscillatorType,
    freq: number,
    startTime: number,
    duration: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    const peak = Math.max(0.0001, SFX_PEAK_GAIN * this.sfxVolume);
    const floor = Math.max(0.00001, SFX_FLOOR_GAIN * this.sfxVolume);
    gain.gain.setValueAtTime(peak, startTime);
    gain.gain.exponentialRampToValueAtTime(floor, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.03);
  }

  private reconcileMusic(): void {
    const ctx = this.ctx;
    if (ctx && this.musicGain) {
      this.musicGain.gain.setTargetAtTime(
        this.musicMuted ? 0 : this.musicVolume,
        ctx.currentTime,
        0.05,
      );
    }
    const running = Boolean(ctx) && ctx?.state === "running";
    const shouldPlay = shouldPlayMusic({
      active: this.musicActive,
      muted: this.musicMuted,
      volume: this.musicVolume,
      running,
    });
    if (shouldPlay && this.musicTimer === null) this.startMusicLoop();
    else if (!shouldPlay && this.musicTimer !== null) this.stopMusicLoop();
  }

  private startMusicLoop(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.nextNoteTime = ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => {
      const now = this.ctx?.currentTime ?? 0;
      while (this.nextNoteTime < now + MUSIC_LOOKAHEAD_S) {
        this.scheduleMusicNote(this.musicStep, this.nextNoteTime);
        this.musicStep += 1;
        this.nextNoteTime += MUSIC_STEP_S;
      }
    }, MUSIC_TIMER_MS);
  }

  private stopMusicLoop(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleMusicNote(step: number, time: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const chord =
      MUSIC_PROGRESSION[
        Math.floor(step / MUSIC_NOTES_PER_CHORD) % MUSIC_PROGRESSION.length
      ];
    if (!chord) return;
    const freq = chord[step % chord.length];
    if (freq === undefined) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.00001, time);
    gain.gain.exponentialRampToValueAtTime(MUSIC_NOTE_GAIN, time + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.00001, time + MUSIC_STEP_S * 0.95);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + MUSIC_STEP_S);
  }
}

let singleton: GameAudioEngine | null = null;

export function getGameAudioEngine(): GameAudioEngine | null {
  if (typeof window === "undefined") return null;
  if (!singleton) singleton = new GameAudioEngine();
  return singleton;
}
