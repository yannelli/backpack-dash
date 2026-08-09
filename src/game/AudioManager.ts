import type { ThemeDefinition, ThemeId } from './types';

type SfxName =
  | 'start'
  | 'jump'
  | 'land'
  | 'pickup'
  | 'cleanFloor'
  | 'elevatorEnter'
  | 'elevatorTravel'
  | 'elevatorExit'
  | 'pause'
  | 'resume'
  | 'newBest'
  | 'failure';

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

const NOTE_STEP_SECONDS = 0.145;

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  private scale: number[] = [0, 3, 7, 10, 12, 15, 19, 22];
  private themeId: ThemeId = 'office';
  private intensity = 1;
  private muted: boolean;
  private intentionallyPaused = false;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  async unlock(): Promise<void> {
    if (!this.context) {
      const AudioCtor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
      if (!AudioCtor) return;
      this.context = new AudioCtor();
      this.master = this.context.createGain();
      this.music = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.62;
      this.music.gain.value = 0.3;
      this.music.connect(this.master);
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended' && !this.intentionallyPaused) {
      await this.context.resume();
    }
    this.startMusic();
  }

  setTheme(theme: ThemeDefinition): void {
    this.scale = [...theme.musicScale];
    this.themeId = theme.id;
    this.step = 0;
  }

  setIntensity(floor: number): void {
    this.intensity = Math.max(1, Math.min(4, Math.ceil(Math.max(1, floor) / 3)));
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.62, this.context.currentTime, 0.015);
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  async pause(): Promise<void> {
    this.intentionallyPaused = true;
    if (this.context?.state === 'running') await this.context.suspend();
  }

  async resume(): Promise<void> {
    this.intentionallyPaused = false;
    if (this.context?.state === 'suspended') await this.context.resume();
  }

  play(name: SfxName, variant = 0): void {
    if (!this.context || !this.master || this.context.state !== 'running') return;
    switch (name) {
      case 'start':
        this.tone(220, 0.09, 'square', 0.12, 0);
        this.tone(330, 0.1, 'square', 0.12, 0.08);
        this.tone(440, 0.18, 'triangle', 0.14, 0.16);
        break;
      case 'jump':
        this.sweep(255, 410, 0.09, 'square', 0.15);
        break;
      case 'land':
        this.sweep(95, 58, 0.07, 'triangle', 0.09);
        this.noiseBurst(0.035, 0.025, 680);
        break;
      case 'pickup':
        this.tone(660 + (variant % 6) * 54, 0.05, 'square', 0.12, 0);
        this.tone(990 + (variant % 6) * 72, 0.07, 'square', 0.1, 0.045);
        break;
      case 'cleanFloor':
        this.tone(392, 0.1, 'square', 0.13, 0);
        this.tone(523, 0.1, 'square', 0.13, 0.08);
        this.tone(659, 0.1, 'square', 0.13, 0.16);
        this.tone(784, 0.24, 'triangle', 0.16, 0.24);
        break;
      case 'elevatorEnter': {
        const root = this.elevatorRoot(variant);
        this.tone(root * 0.78, 0.07, 'square', 0.13, 0);
        this.tone(root * 0.58, 0.09, 'square', 0.12, 0.09);
        this.sweep(root * 0.7, root * 0.28, 0.31, 'sawtooth', 0.09);
        this.tone(root * 0.42, 0.12, 'triangle', 0.13, 0.2);
        break;
      }
      case 'elevatorTravel': {
        const root = this.elevatorRoot(variant);
        const interval = [1.25, 4 / 3, 1.5, 5 / 3][Math.abs(variant) % 4] ?? 1.5;
        this.tone(root, 0.1, 'triangle', 0.13, 0);
        this.tone(root * interval, 0.12, 'square', 0.14, 0.09);
        this.tone(root * 2, 0.18, 'triangle', 0.12, 0.19);
        break;
      }
      case 'elevatorExit': {
        const root = this.elevatorRoot(variant);
        this.sweep(root * 0.3, root * 0.72, 0.34, 'sawtooth', 0.075);
        this.tone(root * 1.5, 0.08, 'square', 0.12, 0.04);
        this.tone(root * 2, 0.16, 'triangle', 0.14, 0.18);
        break;
      }
      case 'pause':
        this.tone(330, 0.08, 'square', 0.09, 0);
        this.tone(220, 0.12, 'square', 0.09, 0.07);
        break;
      case 'resume':
        this.tone(220, 0.08, 'square', 0.09, 0);
        this.tone(330, 0.12, 'square', 0.09, 0.07);
        break;
      case 'newBest':
        this.tone(523, 0.12, 'square', 0.13, 0);
        this.tone(659, 0.12, 'square', 0.13, 0.1);
        this.tone(784, 0.22, 'square', 0.14, 0.2);
        break;
      case 'failure':
        this.sweep(190, 64, 0.42, 'sawtooth', 0.16);
        break;
    }
  }

  destroy(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    void this.context?.close();
    this.context = null;
  }

  private startMusic(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.musicTick(), NOTE_STEP_SECONDS * 1_000);
  }

  private elevatorRoot(variant: number): number {
    const themeRoots: Record<ThemeId, number> = {
      office: 196,
      rooftop: 220,
      subway: 164.81,
      server: 185,
    };
    const floorShift = (Math.abs(Math.floor(variant)) % 4) * 2;
    return themeRoots[this.themeId] * 2 ** (floorShift / 12);
  }

  private musicTick(): void {
    if (!this.context || !this.music || this.context.state !== 'running' || this.muted) return;
    const melodies: Record<ThemeId, number[]> = {
      office: [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 6, 4, 5, 3, 2, 1],
      rooftop: [0, 3, 5, 6, 5, 3, 2, 4, 0, 3, 6, 7, 6, 4, 2, 1],
      subway: [0, 0, 3, 2, 4, 3, 1, 2, 0, 2, 5, 3, 4, 2, 1, 0],
      server: [0, 4, 1, 5, 2, 6, 3, 5, 0, 6, 2, 7, 3, 5, 1, 4],
    };
    const scaleIndex = melodies[this.themeId][this.step % 16] ?? 0;
    const semitone = this.scale[scaleIndex % this.scale.length] ?? 0;
    const base = this.step % 32 >= 16 ? 116.54 : 110;
    const frequency = base * 2 ** (semitone / 12);
    const leadType: OscillatorType =
      this.themeId === 'rooftop' ? 'sawtooth' : this.themeId === 'subway' ? 'triangle' : 'square';
    this.musicTone(
      frequency * (this.intensity >= 4 && this.step % 8 === 6 ? 2 : 1),
      NOTE_STEP_SECONDS * 0.72,
      this.step % 4 === 0 ? 0.085 : 0.052,
      leadType,
    );
    if (this.step % 4 === 0) {
      const bassDegree = this.scale[[0, 3, 4, 2][Math.floor(this.step / 4) % 4] ?? 0] ?? 0;
      this.musicTone(base * 0.5 * 2 ** (bassDegree / 12), NOTE_STEP_SECONDS * 2.35, 0.052, 'triangle');
      this.kick();
    }
    if (this.step % 8 === 4) this.noiseBurst(0.075, 0.032, 1_100);
    if (this.intensity >= 2 && this.step % 2 === 1) this.noiseBurst(0.022, 0.014, 4_800);
    if (this.intensity >= 3 && this.step % 8 === 7) {
      this.musicTone(frequency * 1.5, NOTE_STEP_SECONDS * 0.45, 0.032, 'square');
    }
    this.step += 1;
  }

  private kick(): void {
    if (!this.context || !this.music) return;
    const at = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(128, at);
    oscillator.frequency.exponentialRampToValueAtTime(46, at + 0.09);
    gain.gain.setValueAtTime(0.11, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    oscillator.connect(gain);
    gain.connect(this.music);
    oscillator.start(at);
    oscillator.stop(at + 0.11);
  }

  private noiseBurst(duration: number, volume: number, highpassFrequency: number): void {
    if (!this.context || !this.music) return;
    const frameCount = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = highpassFrequency;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.music);
    source.start();
  }

  private musicTone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'square',
  ): void {
    if (!this.context || !this.music) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume, this.context.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(this.music);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration + 0.01);
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay: number,
  ): void {
    if (!this.context || !this.master) return;
    const at = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.015);
  }

  private sweep(
    start: number,
    end: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ): void {
    if (!this.context || !this.master) return;
    const at = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(start, at);
    oscillator.frequency.exponentialRampToValueAtTime(end, at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.015);
  }
}
