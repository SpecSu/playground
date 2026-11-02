/** Deterministic rhythm scoring. All chart and clock values are seconds. */
export class RhythmGame {
  constructor({ getTime = () => performance.now() / 1000, onJudge = () => {}, onEnd = () => {}, duration = 60, perfectWindow = .065, goodWindow = .14 } = {}) {
    Object.assign(this, { getTime, onJudge, onEnd, duration, perfectWindow, goodWindow });
    this.reset();
  }
  reset() {
    this.state = { status: 'idle', time: 0, duration: this.duration, progress: 0, notes: [], score: 0, combo: 0, maxCombo: 0, accuracy: 100, counts: { perfect: 0, good: 0, miss: 0 }, judged: 0, lastJudgement: null };
    this.origin = 0; this.pausedAt = 0;
    return this.state;
  }
  start(chart, config = {}) {
    const duration = config.duration ?? this.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new TypeError('Invalid duration: expected positive seconds');
    if (!Array.isArray(chart) || chart.some(n => !Number.isFinite(n.time) || n.time < 0 || !Number.isInteger(n.lane) || n.lane < 0 || n.lane > 3)) throw new TypeError('Invalid chart: notes need nonnegative time and lane 0–3');
    this.reset();
    this.state.notes = chart.map((n, id) => ({ ...n, id, judged: false, rating: null })).sort((a,b) => a.time-b.time);
    this.state.duration = Math.max(duration, (this.state.notes.at(-1)?.time ?? 0) + this.goodWindow + .01);
    this.origin = this.getTime();
    this.state.status = 'playing';
    return this.state;
  }
  update() {
    if (this.state.status !== 'playing') return this.state;
    this.state.time = Math.max(0, this.getTime() - this.origin);
    for (const note of this.state.notes) {
      if (note.time > this.state.time) break;
      if (!note.judged && this.state.time - note.time > this.goodWindow + 1e-9) this.judge(note, 'miss', this.state.time - note.time);
    }
    this.state.progress = Math.min(1, this.state.time / this.state.duration);
    if (this.state.time >= this.state.duration) {
      this.state.status = 'ended';
      this.onEnd(this.state);
    }
    return this.state;
  }
  hit(lane) {
    if (this.state.status !== 'playing' || !Number.isInteger(lane) || lane < 0 || lane > 3) return null;
    this.update();
    if (this.state.status !== 'playing') return null;
    let nearest = null, distance = Infinity;
    for (const note of this.state.notes) {
      if (note.judged || note.lane !== lane) continue;
      const delta = Math.abs(note.time - this.state.time);
      if (delta <= this.goodWindow + 1e-9 && delta < distance) { nearest = note; distance = delta; }
    }
    return nearest ? this.judge(nearest, distance <= this.perfectWindow + 1e-9 ? 'perfect' : 'good', this.state.time-nearest.time) : null;
  }
  judge(note, rating, offset) {
    note.judged = true; note.rating = rating;
    const s = this.state;
    s.counts[rating]++; s.judged++;
    s.score += rating === 'perfect' ? 1000 : rating === 'good' ? 650 : 0;
    s.combo = rating === 'miss' ? 0 : s.combo + 1;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.accuracy = s.judged ? s.score / (s.judged * 10) : 100;
    s.lastJudgement = { rating, lane: note.lane, offset, noteId: note.id };
    const event = { rating, lane: note.lane, offset, note, score: s.score, combo: s.combo, state: s };
    this.onJudge(event);
    return event;
  }
  pause() {
    if (this.state.status !== 'playing') return;
    this.update();
    if (this.state.status !== 'playing') return;
    this.pausedAt = this.getTime(); this.state.status = 'paused';
  }
  resume() {
    if (this.state.status !== 'paused') return;
    this.origin += this.getTime() - this.pausedAt;
    this.state.status = 'playing';
  }
}
