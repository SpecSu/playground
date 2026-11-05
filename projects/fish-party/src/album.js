// 相册：钓到鱼后的合影 → 裁成拍立得 4:5 + 压缩 JPEG → 存进 IndexedDB（刷新 / 关掉页面都还在，单张 ≈ 80~140KB，最多留 60 张）
// 对外：album.add(dataURL, info) → Promise<rec> · album.list() → Promise<rec[]>（新的在前）· album.remove(id) · album.n（同步计数，菜单摘要用）
const DB = 'fish-party-album', STORE = 'photos', MAX = 60;
const PW = 720, PH = 900, Q = 0.86;

let dbP = null;
function db() {
  if (dbP) return dbP;
  dbP = new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('no indexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' }).createIndex('t', 't'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  dbP.catch(() => { dbP = null; });
  return dbP;
}
const tx = (mode, fn) => db().then((d) => new Promise((res, rej) => {
  const t = d.transaction(STORE, mode), st = t.objectStore(STORE);
  let out; Promise.resolve(fn(st)).then((v) => { out = v; });
  t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
}));
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// 整屏截图 → 居中裁 4:5（与拍立得预览 object-fit:cover 一致）→ 720×900 JPEG Blob
function toPolaroid(dataURL) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const sw = img.naturalWidth, sh = img.naturalHeight, k = Math.max(PW / sw, PH / sh);
      const cw = PW / k, ch = PH / k, cx = (sw - cw) / 2, cy = (sh - ch) / 2;
      const c = document.createElement('canvas'); c.width = PW; c.height = PH;
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, cx, cy, cw, ch, 0, 0, PW, PH);
      c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', Q);
    };
    img.onerror = () => rej(new Error('image decode failed'));
    img.src = dataURL;
  });
}

export const album = {
  n: 0,
  ready: false,
  async init() {
    try { this.n = await tx('readonly', (st) => req(st.count())); } catch (e) { this.n = 0; }
    this.ready = true; return this.n;
  },
  async add(dataURL, info = {}) {
    const blob = await toPolaroid(dataURL);
    const rec = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), blob, ...info };
    await tx('readwrite', (st) => req(st.put(rec)));
    this.n++;
    if (this.n > MAX) {   // 超出上限：删最旧的
      const all = await this.list();
      for (const r of all.slice(MAX)) await this.remove(r.id);
    }
    return rec;
  },
  async list() {
    const all = await tx('readonly', (st) => req(st.getAll()));
    return (all || []).sort((a, b) => b.t - a.t);
  },
  async remove(id) { await tx('readwrite', (st) => req(st.delete(id))); this.n = Math.max(0, this.n - 1); },
};
