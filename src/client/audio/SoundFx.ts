export class SoundFx {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  // Procedural Music Engine
  private musicGain: GainNode | null = null;
  private musicIntervalId: number | null = null;
  private isMusicPlaying: boolean = false;
  private isSuddenDeath: boolean = false;
  private nextNoteTime: number = 0;
  private current16thStep: number = 0;
  private currentBpm: number = 126;

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  private initCtx(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.musicGain && this.ctx) {
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.enabled ? 0.16 : 0, this.ctx.currentTime);
      this.musicGain.connect(this.ctx.destination);
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(enabled ? 0.16 : 0, this.ctx.currentTime, 0.05);
    }
    if (!enabled && this.isMusicPlaying) {
      this.stopBattleMusic();
    }
  }

  public playBombDrop(): void {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const now = this.ctx.currentTime;
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playExplosion(): void {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Sub-bass thump
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);

    // Filtered noise crackle
    const bufferSize = this.ctx.sampleRate * 0.4;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.4);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    whiteNoise.start(now);
    whiteNoise.stop(now + 0.4);
  }

  public playPowerUp(): void {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [440, 554, 659, 880]; // A4, C#5, E5, A5 arpeggio

    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);

      gain.gain.setValueAtTime(0.18, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.05 + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.1);
    });
  }

  public playPlayerDeath(): void {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.4);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playSuddenDeathAlert(): void {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.setValueAtTime(500, now + 0.15);
    osc.frequency.setValueAtTime(700, now + 0.3);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  public playVictory(): void {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const fanfare = [
      { f: 523.25, t: 0.00, d: 0.12 }, // C5
      { f: 523.25, t: 0.14, d: 0.12 }, // C5
      { f: 523.25, t: 0.28, d: 0.12 }, // C5
      { f: 659.25, t: 0.42, d: 0.25 }, // E5
      { f: 783.99, t: 0.70, d: 0.40 }  // G5
    ];

    fanfare.forEach(item => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(item.f, now + item.t);

      gain.gain.setValueAtTime(0.25, now + item.t);
      gain.gain.exponentialRampToValueAtTime(0.01, now + item.t + item.d);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now + item.t);
      osc.stop(now + item.t + item.d);
    });
  }

  public playSuddenDeathBlockDrop(progress: number = 0): void {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const clamped = Math.max(0, Math.min(1, progress));

    // Ascending base pitch as collapse ring tightens (120Hz -> 380Hz)
    const baseFreq = 120 + clamped * 260;

    // Sub-bass heavy thump
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(baseFreq, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.15);

    subGain.gain.setValueAtTime(0.35 + clamped * 0.15, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.15);

    // Mechanical crush attack
    const crushOsc = this.ctx.createOscillator();
    const crushGain = this.ctx.createGain();
    crushOsc.type = 'sawtooth';
    crushOsc.frequency.setValueAtTime(baseFreq * 2.4, now);
    crushOsc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, now + 0.10);

    crushGain.gain.setValueAtTime(0.20 + clamped * 0.12, now);
    crushGain.gain.exponentialRampToValueAtTime(0.01, now + 0.10);

    crushOsc.connect(crushGain);
    crushGain.connect(this.ctx.destination);
    crushOsc.start(now);
    crushOsc.stop(now + 0.10);
  }

  // ==========================================
  // PROCEDURAL ARCADE CHIPTUNE / SYNTH ENGINE
  // ==========================================
  public startBattleMusic(): void {
    this.initCtx();
    if (!this.ctx || !this.musicGain || this.isMusicPlaying) return;

    this.isMusicPlaying = true;
    this.isSuddenDeath = false;
    this.currentBpm = 126;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.current16thStep = 0;

    this.musicGain.gain.setTargetAtTime(this.enabled ? 0.15 : 0, this.ctx.currentTime, 0.05);

    if (this.musicIntervalId !== null) {
      window.clearInterval(this.musicIntervalId);
    }
    this.musicIntervalId = window.setInterval(() => this.scheduleMusicTick(), 35);
  }

  public setSuddenDeathMusic(active: boolean): void {
    this.isSuddenDeath = active;
    this.currentBpm = active ? 152 : 126;
  }

  public stopBattleMusic(): void {
    this.isMusicPlaying = false;
    if (this.musicIntervalId !== null) {
      window.clearInterval(this.musicIntervalId);
      this.musicIntervalId = null;
    }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
  }

  private scheduleMusicTick(): void {
    if (!this.ctx || !this.isMusicPlaying || !this.musicGain) return;

    const secondsPer16th = (60.0 / this.currentBpm) / 4.0;
    const lookahead = 0.12;

    while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
      this.play16thStep(this.current16thStep, this.nextNoteTime);
      this.nextNoteTime += secondsPer16th;
      this.current16thStep = (this.current16thStep + 1) % 64; // 4 bars
    }
  }

  private play16thStep(step: number, time: number): void {
    if (!this.ctx || !this.musicGain || !this.enabled) return;

    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;

    // D minor progression roots: D2 (73.42), F2 (87.31), G2 (98.00), A2 (110.00)
    const roots = [73.42, 87.31, 98.00, 110.00];
    const rootFreq = roots[bar % 4];

    // 1. DRUMS
    const isKick = stepInBar === 0 || stepInBar === 8 || (this.isSuddenDeath && stepInBar === 14);
    if (isKick) {
      const kickOsc = this.ctx.createOscillator();
      const kickGain = this.ctx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(140, time);
      kickOsc.frequency.exponentialRampToValueAtTime(32, time + 0.09);

      kickGain.gain.setValueAtTime(0.32, time);
      kickGain.gain.exponentialRampToValueAtTime(0.01, time + 0.09);

      kickOsc.connect(kickGain);
      kickGain.connect(this.musicGain);
      kickOsc.start(time);
      kickOsc.stop(time + 0.09);
    }

    const isSnare = stepInBar === 4 || stepInBar === 12;
    if (isSnare) {
      const snareOsc = this.ctx.createOscillator();
      const snareGain = this.ctx.createGain();
      snareOsc.type = 'triangle';
      snareOsc.frequency.setValueAtTime(180, time);
      snareOsc.frequency.exponentialRampToValueAtTime(60, time + 0.10);

      snareGain.gain.setValueAtTime(0.24, time);
      snareGain.gain.exponentialRampToValueAtTime(0.01, time + 0.10);

      snareOsc.connect(snareGain);
      snareGain.connect(this.musicGain);
      snareOsc.start(time);
      snareOsc.stop(time + 0.10);
    }

    const isHat = this.isSuddenDeath ? (stepInBar % 2 === 0) : (stepInBar === 2 || stepInBar === 6 || stepInBar === 10 || stepInBar === 14);
    if (isHat) {
      const hatOsc = this.ctx.createOscillator();
      const hatGain = this.ctx.createGain();
      hatOsc.type = 'sawtooth';
      hatOsc.frequency.setValueAtTime(8000, time);

      hatGain.gain.setValueAtTime(0.05, time);
      hatGain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);

      hatOsc.connect(hatGain);
      hatGain.connect(this.musicGain);
      hatOsc.start(time);
      hatOsc.stop(time + 0.025);
    }

    // 2. SYNTH BASSLINE (driving 16th-note pulses with octave jumps)
    const bassOctave = (stepInBar % 4 === 2 || stepInBar % 4 === 3) ? 2 : 1;
    const bassFreq = rootFreq * bassOctave;

    const bassOsc = this.ctx.createOscillator();
    const bassFilter = this.ctx.createBiquadFilter();
    const bassGain = this.ctx.createGain();

    bassOsc.type = this.isSuddenDeath ? 'sawtooth' : 'triangle';
    bassOsc.frequency.setValueAtTime(bassFreq, time);

    bassFilter.type = 'lowpass';
    bassFilter.frequency.setValueAtTime(this.isSuddenDeath ? 650 : 420, time);

    const bassDuration = (60.0 / this.currentBpm) / 4.0 * 0.75;
    bassGain.gain.setValueAtTime(0.22, time);
    bassGain.gain.exponentialRampToValueAtTime(0.01, time + bassDuration);

    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(this.musicGain);
    bassOsc.start(time);
    bassOsc.stop(time + bassDuration);

    // 3. ARCADE CHIPTUNE MELODY / SYNTH LEAD (heroic motif)
    const melodyPattern: (number | null)[] = [
      293.66, null, 293.66, 349.23,  null, 392.00, null, 440.00,
      null, 523.25, 440.00, 392.00,  349.23, null, 293.66, null,
      349.23, null, 349.23, 392.00,  null, 440.00, null, 523.25,
      587.33, null, 523.25, null,    440.00, null, 392.00, null
    ];

    const leadFreq = melodyPattern[step % 32];
    if (leadFreq !== null && (!this.isSuddenDeath || step % 2 === 0)) {
      const leadOsc = this.ctx.createOscillator();
      const leadGain = this.ctx.createGain();

      leadOsc.type = 'square';
      const actualFreq = this.isSuddenDeath ? leadFreq * 1.5 : leadFreq;
      leadOsc.frequency.setValueAtTime(actualFreq, time);

      const noteLen = (60.0 / this.currentBpm) / 4.0 * 0.65;
      leadGain.gain.setValueAtTime(0.09, time);
      leadGain.gain.exponentialRampToValueAtTime(0.005, time + noteLen);

      leadOsc.connect(leadGain);
      leadGain.connect(this.musicGain);
      leadOsc.start(time);
      leadOsc.stop(time + noteLen);
    }
  }
}

