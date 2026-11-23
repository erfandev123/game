// Sonido sintetizado con WebAudio (sin archivos).
export class Sfx {
  constructor() { this.ctx = null; }

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, len);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  noise(dur, freq, q, gain, type = 'lowpass', sweep = 0) {
    if (!this.ctx || gain <= 0.002) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loopStart = Math.random() * 0.5;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  }

  tone(f0, f1, dur, gain, type = 'sine', delay = 0) {
    if (!this.ctx || gain <= 0.002) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shot(kind, vol = 1) {
    if (kind === 'shotgun') { this.noise(0.32, 1400, 0.6, 0.9 * vol, 'lowpass', 200); this.tone(140, 45, 0.2, 0.7 * vol, 'triangle'); }
    else if (kind === 'smg') { this.noise(0.09, 3200, 0.8, 0.5 * vol, 'lowpass', 700); this.tone(320, 120, 0.06, 0.3 * vol, 'square'); }
    else { this.noise(0.14, 2400, 0.7, 0.65 * vol, 'lowpass', 400); this.tone(210, 70, 0.1, 0.45 * vol, 'triangle'); }
  }
  dry() { this.tone(900, 700, 0.03, 0.15, 'square'); }
  reloadStart() { this.tone(500, 300, 0.05, 0.18, 'square'); this.noise(0.06, 2500, 2, 0.15, 'bandpass'); }
  reloadEnd() { this.tone(700, 1100, 0.05, 0.2, 'square'); this.noise(0.05, 4000, 2, 0.2, 'bandpass'); }
  hit(head) { this.tone(head ? 1700 : 1100, head ? 1300 : 900, 0.06, 0.22, 'triangle'); }
  kill() { this.tone(660, 660, 0.08, 0.25, 'triangle'); this.tone(990, 990, 0.14, 0.25, 'triangle', 0.08); }
  hurt() { this.noise(0.12, 500, 1, 0.5, 'lowpass'); this.tone(160, 90, 0.12, 0.3, 'sawtooth'); }
  step(vol = 1) { this.noise(0.05, 500 + Math.random() * 200, 1, 0.1 * vol, 'lowpass'); }
  jump() { this.noise(0.1, 700, 1, 0.12, 'bandpass', 1500); }
  land() { this.noise(0.12, 300, 1, 0.3, 'lowpass'); }
  slide() { this.noise(0.5, 1800, 0.8, 0.22, 'bandpass', 500); }
  build() { this.tone(260, 520, 0.09, 0.22, 'sawtooth'); this.noise(0.08, 3000, 3, 0.1, 'bandpass'); }
  breakPiece(vol = 1) { this.noise(0.25, 2600, 1, 0.35 * vol, 'highpass'); this.tone(500, 120, 0.2, 0.2 * vol, 'sawtooth'); }
  pickup() { this.tone(700, 1400, 0.1, 0.2, 'sine'); }
  pod() { this.tone(300, 600, 0.15, 0.2, 'triangle'); this.tone(600, 900, 0.2, 0.2, 'triangle', 0.12); }
  zone() { this.tone(220, 180, 0.5, 0.25, 'sawtooth'); this.tone(220, 180, 0.5, 0.25, 'sawtooth', 0.6); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.3, 0.25, 'triangle', i * 0.14)); }
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, f * 0.97, 0.35, 0.25, 'sawtooth', i * 0.2)); }
}
