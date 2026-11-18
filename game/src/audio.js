// audio.js — fully synthesised WebAudio sounds for Solmar City.
// No audio files anywhere: engine hum, two-tone siren, gunshot, pickup
// blip and mission jingle are all built from oscillators and noise.
// Everything is guarded so the game still runs when audio is unavailable
// (headless screenshots, muted browsers).
export function createAudio() {
  const A = {
    ctx: null, master: null, muted: false,
    engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null,
    sirenTimer: 0, sirenHigh: false,
  };

  A.ensure = function ensure() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {}); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : 0.35;
      A.master.connect(A.ctx.destination);
      // Looping engine hum, pitch follows speed (set from main loop).
      A.engineOsc = A.ctx.createOscillator();
      A.engineOsc.type = 'sawtooth';
      A.engineOsc.frequency.value = 55;
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0;
      const filt = A.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 320;
      A.engineOsc.connect(filt); filt.connect(A.engineGain); A.engineGain.connect(A.master);
      A.engineOsc.start();
      // Two-tone police siren.
      A.sirenOsc = A.ctx.createOscillator();
      A.sirenOsc.type = 'triangle';
      A.sirenOsc.frequency.value = 700;
      A.sirenGain = A.ctx.createGain();
      A.sirenGain.gain.value = 0;
      A.sirenOsc.connect(A.sirenGain); A.sirenGain.connect(A.master);
      A.sirenOsc.start();
      return true;
    } catch (e) { return false; }
  };

  A.setMuted = function setMuted(m) {
    A.muted = m;
    if (A.master && A.ctx) A.master.gain.value = m ? 0 : 0.35;
  };

  A.engine = function engine(speedNorm, driving) {
    if (!A.ctx || !A.engineOsc) return;
    const t = A.ctx.currentTime;
    A.engineGain.gain.setTargetAtTime(driving ? 0.05 + 0.05 * speedNorm : 0.0, t, 0.1);
    A.engineOsc.frequency.setTargetAtTime(55 + 90 * speedNorm, t, 0.1);
  };

  A.siren = function siren(active, dt) {
    if (!A.ctx || !A.sirenOsc) return;
    if (!active) { A.sirenGain.gain.setTargetAtTime(0, A.ctx.currentTime, 0.1); return; }
    A.sirenTimer += dt;
    if (A.sirenTimer > 0.45) {
      A.sirenTimer = 0; A.sirenHigh = !A.sirenHigh;
      A.sirenOsc.frequency.setTargetAtTime(A.sirenHigh ? 880 : 660, A.ctx.currentTime, 0.02);
    }
    A.sirenGain.gain.setTargetAtTime(0.045, A.ctx.currentTime, 0.1);
  };

  function blip(freq, dur, type, vol, slideTo) {
    if (!A.ctx) return;
    try {
      const t = A.ctx.currentTime;
      const o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(A.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  function noiseBurst(dur, vol, freq) {
    if (!A.ctx) return;
    try {
      const t = A.ctx.currentTime;
      const len = Math.floor(A.ctx.sampleRate * dur);
      const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = A.ctx.createBufferSource(); src.buffer = buf;
      const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1800;
      const g = A.ctx.createGain(); g.gain.value = vol || 0.4;
      src.connect(f); f.connect(g); g.connect(A.master);
      src.start(t);
    } catch (e) {}
  }

  A.shot = function shot() { noiseBurst(0.12, 0.5, 2400); blip(160, 0.08, 'square', 0.18, 60); };
  A.pickup = function pickup() { blip(660, 0.09, 'sine', 0.25); setTimeout(() => blip(990, 0.12, 'sine', 0.25), 70); };
  A.cash = function cash() { blip(880, 0.08, 'sine', 0.22); setTimeout(() => blip(1174, 0.1, 'sine', 0.22), 80); setTimeout(() => blip(1568, 0.14, 'sine', 0.22), 160); };
  A.jingle = function jingle() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => blip(f, 0.18, 'triangle', 0.25), i * 110));
  };
  A.busted = function busted() { blip(392, 0.25, 'sawtooth', 0.2, 196); setTimeout(() => blip(311, 0.4, 'sawtooth', 0.2, 155), 240); };
  A.horn = function horn() { blip(370, 0.18, 'square', 0.12); setTimeout(() => blip(370, 0.18, 'square', 0.12), 200); };
  return A;
}
