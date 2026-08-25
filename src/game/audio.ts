export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private droneOsc: OscillatorNode[] = [];
  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  muted = false;

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  private noise(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = "bandpass", sweepTo?: number) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = "sine", when = 0, glideTo?: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  step() {
    this.noise(0.14, 320, 1.2, 0.5, "lowpass");
    this.tone(92, 0.1, 0.18, "sine", 0, 60);
  }
  turn() {
    this.noise(0.28, 500, 2.5, 0.3, "bandpass", 1600);
  }
  bump() {
    this.tone(70, 0.22, 0.5, "sine", 0, 38);
    this.noise(0.16, 200, 1, 0.4, "lowpass");
  }
  chime(base = 660) {
    this.tone(base, 0.5, 0.16, "sine");
    this.tone(base * 1.5, 0.6, 0.12, "sine", 0.09);
    this.tone(base * 2, 0.7, 0.07, "triangle", 0.18);
  }
  discover() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.42, 0.14, "triangle", i * 0.09));
  }
  fanfare() {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.55, 0.15, "triangle", i * 0.11));
    this.noise(1.2, 2400, 0.8, 0.06, "highpass");
  }
  click() {
    this.tone(880, 0.07, 0.12, "square", 0, 620);
  }
  splash() {
    this.noise(0.3, 1200, 1.4, 0.2, "bandpass", 400);
  }

  startDrone() {
    if (!this.ctx || !this.master || this.droneOsc.length) return;
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 220;
    this.droneFilter.connect(this.droneGain).connect(this.master);
    [55, 82.5, 110.5].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = i === 2 ? "triangle" : "sine";
      o.frequency.value = f;
      o.detune.value = (i - 1) * 6;
      o.connect(this.droneFilter!);
      o.start();
      this.droneOsc.push(o);
    });
    this.droneGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 1.2);
  }

  /** 0 = deep underground ... 1 = open air */
  setDroneMood(openness: number) {
    if (!this.ctx || !this.droneFilter || !this.droneGain) return;
    this.droneFilter.frequency.setTargetAtTime(140 + openness * 620, this.ctx.currentTime, 0.8);
    this.droneGain.gain.setTargetAtTime(0.035 + openness * 0.02, this.ctx.currentTime, 0.8);
  }
}
