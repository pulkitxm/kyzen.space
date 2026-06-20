import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  VOLUME_MAX,
  VOLUME_MIN,
  VOLUME_STEP,
} from "@kyzen/shared/constants";

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

export type SfxKey = "hover" | "touch" | "win" | "draw";
export type SfxSources = Partial<Record<SfxKey, string>>;

const SFX_KEYS: SfxKey[] = ["hover", "touch", "win", "draw"];

const MUSIC_FADE_S = 2.5;

export class GameAudioEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private sfxVolume = DEFAULT_SFX_VOLUME;
  private sfxMuted = false;
  private musicVolume = DEFAULT_MUSIC_VOLUME;
  private musicMuted = false;
  private musicActive = false;
  private musicUrl: string | null = null;
  private musicElement: HTMLAudioElement | null = null;
  private musicElementNode: MediaElementAudioSourceNode | null = null;
  private musicFileGain: GainNode | null = null;
  private musicLastTime = 0;
  private musicFadingOut = false;
  private sfxUrls: SfxSources = {};
  private sfxBuffers: Partial<Record<SfxKey, AudioBuffer>> = {};
  private sfxLoading = new Set<SfxKey>();

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.ctx.onstatechange = () => this.reconcileMusic();
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicMuted ? 0 : this.musicVolume;
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxMuted ? 0 : this.sfxVolume;
      this.sfxGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    this.reconcileMusic();
    this.preloadSfx();
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = clampVolume(volume);
    this.applySfxGain();
  }

  setSfxMuted(muted: boolean): void {
    this.sfxMuted = muted;
    this.applySfxGain();
  }

  setSfxSources(sources: SfxSources): void {
    this.sfxUrls = { ...sources };
    this.sfxBuffers = {};
    this.preloadSfx();
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

  setMusicSource(url: string | null): void {
    if (this.musicUrl === url) return;
    this.musicUrl = url;
    this.teardownFileMusic();
    this.reconcileMusic();
  }

  playHover(): void {
    this.playSfx("hover");
  }

  playTouch(): void {
    this.playSfx("touch");
  }

  playWin(): void {
    this.playSfx("win");
  }

  playDraw(): void {
    this.playSfx("draw");
  }

  private applySfxGain(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    this.sfxGain.gain.setTargetAtTime(
      this.sfxMuted ? 0 : this.sfxVolume,
      ctx.currentTime,
      0.02,
    );
  }

  private playSfx(key: SfxKey): void {
    const ctx = this.ensureContext();
    if (!ctx || this.sfxMuted || this.sfxVolume <= 0) return;
    if (ctx.state === "suspended") void ctx.resume();
    const buffer = this.sfxBuffers[key];
    if (buffer) {
      this.fireSfx(ctx, buffer);
      return;
    }
    const url = this.sfxUrls[key];
    if (url) void this.loadSfx(ctx, key, url, true);
  }

  private fireSfx(ctx: AudioContext, buffer: AudioBuffer): void {
    if (!this.sfxGain) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.sfxGain);
    src.start();
  }

  private async loadSfx(
    ctx: AudioContext,
    key: SfxKey,
    url: string,
    playAfter: boolean,
  ): Promise<void> {
    if (this.sfxBuffers[key] || this.sfxLoading.has(key)) return;
    this.sfxLoading.add(key);
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      this.sfxBuffers[key] = buffer;
      if (playAfter && !this.sfxMuted && this.sfxVolume > 0) {
        this.fireSfx(ctx, buffer);
      }
    } catch {
    } finally {
      this.sfxLoading.delete(key);
    }
  }

  private preloadSfx(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const key of SFX_KEYS) {
      const url = this.sfxUrls[key];
      if (url) void this.loadSfx(ctx, key, url, false);
    }
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
    if (shouldPlay) this.startMusic();
    else this.stopMusic();
  }

  private startMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicUrl) return;
    this.startFileMusic(ctx);
  }

  private stopMusic(): void {
    this.stopFileMusic();
  }

  private startFileMusic(ctx: AudioContext): void {
    const url = this.musicUrl;
    if (!url || !this.musicGain) return;
    if (!this.musicElement) {
      const el = new Audio(url);
      el.loop = true;
      el.preload = "auto";
      el.addEventListener("error", () => {
        this.musicUrl = null;
        this.teardownFileMusic();
      });
      el.addEventListener("timeupdate", () => this.handleMusicTimeUpdate());
      const fileGain = ctx.createGain();
      fileGain.gain.value = 0.0001;
      const node = ctx.createMediaElementSource(el);
      node.connect(fileGain);
      fileGain.connect(this.musicGain);
      this.musicElement = el;
      this.musicElementNode = node;
      this.musicFileGain = fileGain;
      this.musicLastTime = 0;
      this.musicFadingOut = false;
    }
    void this.musicElement.play().catch(() => {});
    this.fadeMusicIn();
  }

  private fadeMusicIn(): void {
    const ctx = this.ctx;
    const gain = this.musicFileGain;
    if (!ctx || !gain) return;
    this.musicFadingOut = false;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(
      Math.max(0.0001, gain.gain.value),
      ctx.currentTime,
    );
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + MUSIC_FADE_S);
  }

  private handleMusicTimeUpdate(): void {
    const ctx = this.ctx;
    const el = this.musicElement;
    const gain = this.musicFileGain;
    if (!ctx || !el || !gain) return;
    const duration = el.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const time = el.currentTime;
    if (time < this.musicLastTime - 0.5) this.fadeMusicIn();
    this.musicLastTime = time;
    const remaining = duration - time;
    if (!this.musicFadingOut && remaining <= MUSIC_FADE_S) {
      this.musicFadingOut = true;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(
        Math.max(0.0001, gain.gain.value),
        ctx.currentTime,
      );
      gain.gain.linearRampToValueAtTime(
        0.0001,
        ctx.currentTime + Math.max(0.05, remaining),
      );
    }
  }

  private stopFileMusic(): void {
    this.musicElement?.pause();
  }

  private teardownFileMusic(): void {
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement.removeAttribute("src");
      this.musicElement.load();
      this.musicElementNode?.disconnect();
      this.musicFileGain?.disconnect();
      this.musicElement = null;
      this.musicElementNode = null;
      this.musicFileGain = null;
      this.musicFadingOut = false;
      this.musicLastTime = 0;
    }
  }
}

let singleton: GameAudioEngine | null = null;

export function getGameAudioEngine(): GameAudioEngine | null {
  if (typeof window === "undefined") return null;
  if (!singleton) singleton = new GameAudioEngine();
  return singleton;
}
