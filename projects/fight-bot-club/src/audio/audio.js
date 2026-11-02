const BGM_VOL = 0.24; // 新 BGM 基础音量：与音效平衡，战斗大招时仍会自动闪避压低
// 音频：真实采样精灵表（sfx.mp3）+ 电子配乐（bgm.mp3）
// 母线：SFX → 压缩 → master；BGM → 闪避增益 → master。同名切片冷却 + 全局声部上限，防止堆叠成噪声墙。
import SPRITE from './sprite.json';

const BASE = (import.meta.env?.BASE_URL || './');

export class AudioEngine {
  constructor() {
    this.ready = false; this.unlocked = false; this.muted = false;
    this.last = {}; this.voices = 0; this.maxVoices = 18; this.slow = 1;
  }
  async init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.85;
    this.sfxLP = c.createBiquadFilter(); this.sfxLP.type = 'lowpass'; this.sfxLP.frequency.value = 20000;
    this.sfx.connect(this.sfxLP); this.sfxLP.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = 0.0;
    this.duck = c.createGain(); this.duck.gain.value = 1;
    this.musicLP = c.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 20000;
    this.music.connect(this.musicLP); this.musicLP.connect(this.duck); this.duck.connect(this.master);
    this.crowd = c.createGain(); this.crowd.gain.value = 0; this.crowd.connect(this.master);
    const load = async (url) => { const r = await fetch(url); const b = await r.arrayBuffer(); return await new Promise((res, rej) => c.decodeAudioData(b, res, rej)); };
    this.sfxBuf = await load(BASE + 'audio/sfx.mp3');
    this.ready = true;
    // 旧版电子配乐（保留备用）：
    // load(BASE + 'audio/bgm.mp3').then((b) => { this.bgmBuf = b; if (this.wantMusic) this.startMusic(); }).catch(() => {});
    // 新 BGM：PacificRim.mp3（响度约 -9.3 LUFS，比旧版高约 6dB，故音量相应下调）
    load(BASE + 'audio/PacificRim.mp3').then((b) => { this.bgmBuf = b; if (this.wantMusic) this.startMusic(); }).catch(() => {});
  }
  unlock() {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') this.ctx.resume();
    if (!this.unlocked) {
      // iOS：播放一段静音缓冲以解锁
      const b = this.ctx.createBuffer(1, 1, 22050); const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      this.unlocked = true;
    }
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); }
  startMusic() {
    this.wantMusic = true;
    if (!this.bgmBuf || this.bgmSrc || !this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.bgmBuf; s.loop = true; s.connect(this.music); s.start();
    this.bgmSrc = s;
    // this.music.gain.setTargetAtTime(0.42, this.ctx.currentTime, 1.2); // 旧 BGM 音量
    this.music.gain.setTargetAtTime(BGM_VOL, this.ctx.currentTime, 1.2);
    this.startCrowd();
  }
  startCrowd() {
    if (this.crowdSrc) return;
    const [o, d] = SPRITE.cheer2; const s = this.ctx.createBufferSource(); s.buffer = this.sfxBuf; s.loop = true; s.loopStart = o + 0.3; s.loopEnd = o + d - 0.3;
    s.connect(this.crowd); s.start(0, o + 0.3); this.crowdSrc = s;
    this.crowd.gain.setTargetAtTime(0.06, this.ctx.currentTime, 1);
  }
  setExcite(e) { if (this.crowd) this.crowd.gain.setTargetAtTime(0.04 + e * 0.12, this.ctx.currentTime, 0.6); }
  // 子弹时间：降低音高 + 低通
  setSlow(s) {
    if (!this.ctx) return; this.slow = s; const t = this.ctx.currentTime;
    this.sfxLP.frequency.setTargetAtTime(s < 0.9 ? 2200 + s * 6000 : 20000, t, 0.06);
    this.musicLP.frequency.setTargetAtTime(s < 0.9 ? 900 : 20000, t, 0.1);
  }
  duckMusic(amount = 0.55, hold = 0.25) {
    if (!this.ctx) return; const t = this.ctx.currentTime, g = this.duck.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(amount, t + 0.03); g.setTargetAtTime(1, t + hold, 0.35);
  }
  // name: 切片名；opt: { vol, rate, pan, cd, delay, dist }
  play(name, opt = {}) {
    if (!this.ready || this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const sp = SPRITE[name]; if (!sp) return;
    const now = this.ctx.currentTime;
    const cd = opt.cd ?? 0.05;
    if (this.last[name] && now - this.last[name] < cd) return;
    if (this.voices >= this.maxVoices && !opt.force) return;
    this.last[name] = now;
    const s = this.ctx.createBufferSource(); s.buffer = this.sfxBuf;
    const rate = (opt.rate ?? 1) * (opt.vary === false ? 1 : 0.94 + Math.random() * 0.12) * (this.slow < 0.9 ? 0.75 : 1);
    s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = (opt.vol ?? 1) * (opt.dist != null ? Math.max(0.25, 1 - opt.dist / 40) : 1);
    let node = g;
    if (opt.pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opt.pan)); g.connect(p); node = p; }
    s.connect(g); node.connect(opt.bus === 'master' ? this.master : this.sfx);
    const dur = opt.dur ?? sp[1];
    const when = now + (opt.delay || 0);
    s.start(when, sp[0], dur);
    if (opt.fade) { g.gain.setValueAtTime(g.gain.value, when + dur - opt.fade); g.gain.linearRampToValueAtTime(0, when + dur); }
    this.voices++; s.onended = () => { this.voices--; };
    return s;
  }
  pick(arr, opt) { return this.play(arr[Math.floor(Math.random() * arr.length)], opt); }
  // 投票点击：合成的短促清脆“哒”——高频三角波快速下滑 + 极短噪声瞬态；直连 master，不受慢镜低通影响
  tap(k = 0) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime;
    if (this._tapT && t - this._tapT < 0.025) return; this._tapT = t;
    const f0 = 1500 + Math.min(1, k) * 700 + Math.random() * 120;
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.06);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.1);
    if (!this._clickBuf) { const n = Math.floor(c.sampleRate * 0.012), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); this._clickBuf = b; }
    const s = c.createBufferSource(); s.buffer = this._clickBuf;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g2 = c.createGain(); g2.gain.value = 0.22; s.connect(hp); hp.connect(g2); g2.connect(this.master); s.start(t);
  }
  // 持续声（喷火 / 电锯）
  loop(key, name, vol = 0.6) {
    if (!this.ready || !this.ctx || this.ctx.state !== 'running') return;
    this.loops = this.loops || {};
    if (this.loops[key]) return;
    const sp = SPRITE[name]; const s = this.ctx.createBufferSource(); s.buffer = this.sfxBuf; s.loop = true;
    s.loopStart = sp[0] + 0.15; s.loopEnd = sp[0] + sp[1] - 0.1;
    const g = this.ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.04);
    s.connect(g); g.connect(this.sfx); s.start(0, sp[0] + 0.05); this.loops[key] = { s, g };
  }
  stopLoop(key) {
    const L = this.loops && this.loops[key]; if (!L) return;
    const t = this.ctx.currentTime; L.g.gain.setTargetAtTime(0, t, 0.08); L.s.stop(t + 0.4); delete this.loops[key];
  }
  stopAllLoops() { if (this.loops) for (const k in this.loops) this.stopLoop(k); }
}
