export class EngineAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private screechGain: GainNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private muted = false;
  private started = false;
  private lastImpactAt = 0;

  public unlock(): void {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.22;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Dual-oscillator sports engine
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.value = 55;
      osc2.frequency.value = 110;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      filter.Q.value = 2.4;

      const eGain = ctx.createGain();
      eGain.gain.value = 0.0;

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(eGain);
      eGain.connect(master);

      osc1.start();
      osc2.start();

      this.engineOsc1 = osc1;
      this.engineOsc2 = osc2;
      this.engineFilter = filter;
      this.engineGain = eGain;

      // Filtered noise buffer for tire screech
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;

      const sFilter = ctx.createBiquadFilter();
      sFilter.type = 'bandpass';
      sFilter.frequency.value = 1150;
      sFilter.Q.value = 4.2;

      const sGain = ctx.createGain();
      sGain.gain.value = 0;

      noiseSrc.connect(sFilter);
      sFilter.connect(sGain);
      sGain.connect(master);
      noiseSrc.start();

      this.screechFilter = sFilter;
      this.screechGain = sGain;
      this.started = true;
    } catch {
      // AudioContext unavailable in restricted headless environments
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.22, this.ctx.currentTime, 0.04);
    }
  }

  public update(params: {
    playing: boolean;
    rpm: number;
    throttle: number;
    rearSlip: number;
    speedKmh: number;
    impactIntensity: number;
  }): void {
    if (!this.started || !this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineFilter || !this.engineGain || !this.screechGain || !this.screechFilter) {
      return;
    }

    const now = this.ctx.currentTime;
    if (!params.playing || this.muted) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.06);
      this.screechGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    const baseFreq = 32 + (params.rpm / 7400) * 145;
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.03);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.99, now, 0.03);
    this.engineFilter.frequency.setTargetAtTime(
      180 + (params.rpm / 7400) * 650 + params.throttle * 420,
      now,
      0.04
    );
    this.engineGain.gain.setTargetAtTime(0.16 + params.throttle * 0.22, now, 0.04);

    const screechAmt =
      params.speedKmh > 18 && params.rearSlip > 0.35
        ? Math.min(0.28, (params.rearSlip - 0.35) * 0.32)
        : 0;
    this.screechGain.gain.setTargetAtTime(screechAmt, now, 0.04);
    this.screechFilter.frequency.setTargetAtTime(980 + Math.min(600, params.speedKmh * 3.5), now, 0.05);

    if (params.impactIntensity > 0.2 && now - this.lastImpactAt > 0.22) {
      this.lastImpactAt = now;
      this.triggerImpact(params.impactIntensity);
    }
  }

  private triggerImpact(intensity: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.14);
    g.gain.setValueAtTime(Math.min(0.45, intensity * 0.4), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
