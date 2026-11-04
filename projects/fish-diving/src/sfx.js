// 程序化音效（WebAudio 合成，零资源）
// 环境：海浪（多层滤波噪声 + 慢速涌浪 LFO）、海鸥、船体吱呀；音乐：chill 和弦 pad + 五声音阶拨弦
// 过程：蓄力、甩竿呼啸、入水、轻啄、咬钩、扬竿、收线齿轮、张力吱吱、鱼跃、出水、钓获号角、稀有闪光、好友通知、升级、任务完成
let ctx = null, master = null, sfxBus = null, ambBus = null, musBus = null, noiseBuf = null;
let muted = false, musicOn = true;
const VOL = { master: 0.5, sfx: 0.8, amb: 0.55, mus: 0.22 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : VOL.master;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = VOL.sfx; sfxBus.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = VOL.amb; ambBus.connect(master);
  musBus = ctx.createGain(); musBus.gain.value = musicOn ? VOL.mus : 0; musBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0; // 粉噪声，更柔和
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
  startAmbience();
  startMusic();
}
export function toggleMute() { muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : VOL.master, ctx.currentTime, 0.1); return muted; }
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : VOL.master; }
export function toggleMusic() { musicOn = !musicOn; if (musBus) musBus.gain.setTargetAtTime(musicOn ? VOL.mus : 0, ctx.currentTime, 0.3); return musicOn; }
export function setMusic(on) { musicOn = on; if (musBus) musBus.gain.value = on ? VOL.mus : 0; }

function env(g, t0, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
}
function tone(type, f0, f1, dur, vol = 0.3, delay = 0, bus = sfxBus, attack = 0.008) {
  if (!ctx) return;
  const t = ctx.currentTime + Math.max(0, delay);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  env(g, t, attack, vol, dur);
  o.connect(g).connect(bus); o.start(t); o.stop(t + dur + attack + 0.05);
}
function noise(dur, freq, q = 0.8, vol = 0.3, type = 'lowpass', delay = 0, sweepTo = 0, bus = sfxBus, attack = 0.01) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain(); env(g, t, attack, vol, dur);
  s.connect(f).connect(g).connect(bus); s.start(t, Math.random() * 1.0); s.stop(t + dur + attack + 0.05);
}

// ---------------- 环境声 ----------------
let gullTimer = 4, creakTimer = 6;
function startAmbience() {
  // 持续的浪：低频涌浪 + 中频沙沙 + 高频泡沫，增益被慢速 LFO 调制（一呼一吸的海）
  const layer = (freq, q, vol, lfoHz, depth, type = 'lowpass') => {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = vol;
    const lfo = ctx.createOscillator(); lfo.frequency.value = lfoHz;
    const lg = ctx.createGain(); lg.gain.value = vol * depth;
    lfo.connect(lg).connect(g.gain);
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = lfoHz * 0.37;
    const lg2 = ctx.createGain(); lg2.gain.value = freq * 0.35;
    lfo2.connect(lg2).connect(f.frequency);
    s.connect(f).connect(g).connect(ambBus);
    s.start(); lfo.start(); lfo2.start();
  };
  layer(380, 0.6, 0.5, 0.11, 0.7);
  layer(1600, 0.4, 0.09, 0.17, 0.8, 'bandpass');
  layer(5200, 0.3, 0.025, 0.07, 0.6, 'highpass');
  setInterval(() => { if (Math.random() > 0.55) return; noise(0.35 + Math.random() * 0.3, 260 + Math.random() * 120, 1.4, 0.16, 'lowpass', 0, 0, ambBus, 0.06); }, 1700);
  setInterval(() => {
    gullTimer -= 1; creakTimer -= 1;
    if (gullTimer <= 0) { gull(); gullTimer = 9 + Math.random() * 16; }
    if (creakTimer <= 0) { creak(); creakTimer = 7 + Math.random() * 12; }
  }, 1000);
}
function gull() {
  const n = 1 + Math.floor(Math.random() * 3);
  const base = 1300 + Math.random() * 500;
  for (let i = 0; i < n; i++) {
    const d = i * (0.28 + Math.random() * 0.1);
    tone('sawtooth', base, base * 0.62, 0.22, 0.012, d, ambBus, 0.03);
    tone('sine', base * 1.01, base * 0.6, 0.24, 0.03, d, ambBus, 0.03);
  }
}
function creak() {
  const f = 120 + Math.random() * 80;
  tone('sawtooth', f, f * 1.25, 0.5, 0.008, 0, ambBus, 0.15);
  noise(0.5, 900, 6, 0.02, 'bandpass', 0, 600, ambBus, 0.15);
}

// ---------------- 音乐：慢速 lo-fi 和弦 + 拨弦 ----------------
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]];
const PENTA = [69, 72, 74, 76, 79, 81, 84];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function startMusic() {
  let bar = 0, next = ctx.currentTime + 0.5;
  const BAR = 4.2;
  const sched = () => {
    while (next < ctx.currentTime + 1.2) {
      const ch = CHORDS[bar % CHORDS.length];
      for (const m of ch) {
        const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m) * 1.003;
        f.type = 'lowpass'; f.frequency.value = 1400;
        g.gain.setValueAtTime(0.0001, next); g.gain.linearRampToValueAtTime(0.05, next + 1.2); g.gain.linearRampToValueAtTime(0.0001, next + BAR + 0.6);
        o.connect(f); o2.connect(f); f.connect(g).connect(musBus);
        o.start(next); o2.start(next); o.stop(next + BAR + 0.7); o2.stop(next + BAR + 0.7);
      }
      tone('sine', mtof(ch[0] - 12), mtof(ch[0] - 12), BAR * 0.9, 0.09, next - ctx.currentTime, musBus, 0.05);
      for (let i = 0; i < 8; i++) {
        if (Math.random() < 0.45) continue;
        const m = PENTA[Math.floor(Math.random() * PENTA.length)];
        const tt = next + i * (BAR / 8) + (Math.random() - 0.5) * 0.04;
        tone('triangle', mtof(m), mtof(m) * 0.998, 0.9, 0.05, tt - ctx.currentTime, musBus, 0.004);
        tone('sine', mtof(m) * 2, mtof(m) * 2, 0.4, 0.012, tt - ctx.currentTime, musBus, 0.004);
      }
      next += BAR; bar++;
    }
  };
  setInterval(sched, 400); sched();
}

// ---------------- 过程音效 ----------------
let reelNode = null;
export const sfx = {
  tap() { tone('sine', 900, 1200, 0.06, 0.08); },
  open() { tone('sine', 520, 780, 0.12, 0.08); tone('sine', 780, 1040, 0.12, 0.06, 0.06); },
  close() { tone('sine', 780, 520, 0.1, 0.07); },
  tick(p) { tone('sine', 300 + p * 600, 300 + p * 620, 0.04, 0.025); },
  perfectCast() { tone('triangle', 1175, 1175, 0.12, 0.12); tone('triangle', 1568, 1568, 0.2, 0.1, 0.07); },
  cast() { noise(0.45, 500, 1.4, 0.24, 'bandpass', 0, 3200); tone('sine', 900, 300, 0.4, 0.03); },
  whoosh() { noise(0.7, 2400, 3, 0.08, 'bandpass', 0, 700); },
  plop() { tone('sine', 760, 150, 0.18, 0.3); noise(0.3, 1400, 0.7, 0.14); tone('sine', 380, 900, 0.08, 0.06, 0.12); },
  nibble() { tone('sine', 520, 300, 0.07, 0.16); noise(0.08, 1800, 1, 0.06); },
  bite() { tone('sine', 260, 70, 0.32, 0.45); noise(0.5, 900, 0.6, 0.34); tone('triangle', 880, 880, 0.09, 0.14, 0.02); tone('triangle', 1175, 1175, 0.09, 0.12, 0.12); },
  hookset(perfect) {
    noise(0.22, 500, 1.5, 0.28, 'bandpass', 0, 3000);
    tone('sine', 180, 90, 0.18, 0.2);
    if (perfect) { tone('triangle', 988, 988, 0.1, 0.16, 0.05); tone('triangle', 1319, 1319, 0.18, 0.16, 0.13); tone('triangle', 1976, 1976, 0.25, 0.1, 0.21); }
  },
  click() { noise(0.025, 3200, 4, 0.06, 'bandpass'); },
  reel(on, tension = 0) {
    if (!ctx) return;
    if (on && !reelNode) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 38; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 2;
      g.gain.value = 0.0; o.connect(f).connect(g).connect(sfxBus); o.start();
      reelNode = { o, g, f };
    }
    if (reelNode) {
      reelNode.g.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.05);
      reelNode.o.frequency.setTargetAtTime(30 + tension * 30, ctx.currentTime, 0.1);
      reelNode.f.frequency.setTargetAtTime(1400 + tension * 1600, ctx.currentTime, 0.1);
    }
  },
  strain(t) { tone('sawtooth', 600 + t * 500, 640 + t * 520, 0.08, 0.012 * t); },
  splash(big = 1) { noise(0.35 + big * 0.3, 1100, 0.6, 0.24 * big); tone('sine', 300, 90, 0.2, 0.12 * big); noise(0.2, 3500, 1, 0.05 * big, 'highpass', 0.05); },
  jump() { noise(0.4, 1500, 0.7, 0.26); tone('sine', 400, 900, 0.25, 0.06); },
  warn() { tone('square', 740, 740, 0.06, 0.05); tone('square', 740, 740, 0.06, 0.05, 0.12); },
  slip() { noise(0.5, 2500, 2, 0.2, 'bandpass', 0, 400); tone('sine', 500, 120, 0.4, 0.1); },
  snap() { noise(0.08, 4000, 1, 0.3, 'highpass'); tone('triangle', 1400, 200, 0.3, 0.1); sfx.sad(); },
  sad() { tone('triangle', 494, 494, 0.18, 0.08, 0.15); tone('triangle', 440, 440, 0.18, 0.08, 0.35); tone('triangle', 392, 370, 0.4, 0.08, 0.55); },
  landing() { noise(0.7, 1200, 0.6, 0.36); tone('sine', 220, 70, 0.35, 0.18); },
  catch(rarity = 'common') {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => tone('triangle', f, f, 0.22, 0.17, i * 0.08));
    tone('sine', 1047, 1047, 0.6, 0.1, notes.length * 0.08);
    if (rarity === 'epic' || rarity === 'legendary') {
      [1568, 1760, 2093, 2637].forEach((f, i) => tone('sine', f, f, 0.35, 0.07, 0.5 + i * 0.07));
      noise(1.2, 6000, 0.5, 0.05, 'highpass', 0.45);
    }
  },
  sparkle() { [1760, 2217, 2637, 3520].forEach((f, i) => tone('sine', f, f, 0.18, 0.05, i * 0.05)); },
  flop() { noise(0.12, 900, 1.2, 0.12); tone('sine', 260, 140, 0.08, 0.05); },
  release() { tone('sine', 400, 900, 0.18, 0.12); tone('sine', 600, 1200, 0.2, 0.08, 0.1); },
  notify() { tone('sine', 1047, 1047, 0.12, 0.06); tone('sine', 1568, 1568, 0.18, 0.05, 0.09); },
  like() { tone('sine', 880, 1320, 0.1, 0.08); tone('triangle', 1320, 1760, 0.14, 0.06, 0.06); },
  coin() { tone('square', 988, 988, 0.06, 0.04); tone('square', 1319, 1319, 0.16, 0.04, 0.06); },
  levelUp() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, 0.18, 0.12, i * 0.09)); },
  task() { [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, f, 0.14, 0.1, i * 0.07)); },
  shutter() { noise(0.05, 3000, 1, 0.3, 'highpass'); noise(0.08, 1500, 1, 0.2, 'bandpass', 0.07); },
  // ---------- v1.0 派对循环音效（程序化） ----------
  // 收进水族箱：气泡 "啵" + 上滑铃
  pop() { tone('sine', 300, 1100, 0.09, 0.22); noise(0.06, 2400, 2, 0.08, 'bandpass'); tone('triangle', 1319, 1760, 0.12, 0.07, 0.07); },
  stow() { sfx.pop(); [784, 1047, 1568].forEach((f, i) => tone('sine', f, f * 1.02, 0.14, 0.06, 0.1 + i * 0.06)); },
  // 变卵：魔法上扬琶音 + 嗡鸣
  eggify() { [523, 659, 784, 988, 1175, 1568].forEach((f, i) => tone('sine', f, f, 0.2, 0.06, i * 0.06)); tone('triangle', 196, 392, 0.9, 0.05, 0, sfxBus, 0.2); noise(0.8, 3000, 0.7, 0.04, 'highpass', 0.1, 6000); },
  // 卵抖动：咯噔咯噔
  eggShake() { for (let i = 0; i < 6; i++) { noise(0.04, 1800 + i * 200, 3, 0.05 + i * 0.012, 'bandpass', i * 0.2); tone('sine', 520 + i * 40, 420, 0.05, 0.04, i * 0.2); } },
  // 孵化：蛋壳裂开 + 光爆 + 小号式欢呼
  hatch() { noise(0.12, 3800, 1.5, 0.22, 'highpass'); noise(0.25, 1200, 1, 0.14, 'bandpass', 0.05); tone('sine', 180, 1400, 0.35, 0.1, 0.06); [659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, 0.24, 0.12, 0.25 + i * 0.07)); },
  // 突变！：警报式下滑 + 低频冲击 + 闪亮和弦
  mutate() {
    tone('sawtooth', 220, 55, 0.6, 0.09); noise(0.6, 400, 0.7, 0.25, 'lowpass');
    [0, 0.16].forEach((d) => { tone('square', 880, 1320, 0.1, 0.05, d); tone('square', 1320, 880, 0.1, 0.05, d + 0.08); });
    [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone('triangle', f, f, 0.3, 0.09, 0.4 + i * 0.06));
    noise(1.4, 7000, 0.5, 0.06, 'highpass', 0.4);
  },
  // 放生：大水花 + 渐远的气泡
  releaseSplash() { noise(0.7, 1400, 0.6, 0.3); tone('sine', 340, 80, 0.3, 0.14); for (let i = 0; i < 5; i++) tone('sine', 500 + i * 120, 900 + i * 160, 0.06, 0.05, 0.25 + i * 0.09); },
  // 被钓到通知：叮咚 + 小号
  oceanBell(mine) { tone('sine', 1319, 1319, 0.16, 0.08); tone('sine', 988, 988, 0.24, 0.07, 0.12); if (mine) [1047, 1319, 1568, 2093].forEach((f, i) => tone('triangle', f, f, 0.18, 0.08, 0.3 + i * 0.07)); },
  frenzy() { [392, 523, 659, 784, 1047].forEach((f, i) => tone('sawtooth', f, f, 0.15, 0.035, i * 0.06)); noise(1.2, 800, 0.5, 0.2, 'lowpass', 0, 3000); },
};
