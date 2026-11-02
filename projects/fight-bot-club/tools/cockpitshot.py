# 驾驶舱遮挡检查：10 体型 × 4 舱型，正前略俯 + 3/4 侧两个机位，截分身周围特写
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/u3/ck.png'
JS = r"""
async () => {
  const g = window.__G, T = g.THREE, R = g.renderer;
  const FORMS = ['humanoid', 'dog', 'spider', 'tank', 'manta', 'tiger', 'turtle', 'croc', 'trex', 'flamingo'];
  const S = 150, cols = 8, rows = FORMS.length;
  const cv = document.createElement('canvas'); cv.width = S * cols; cv.height = S * rows; const ctx = cv.getContext('2d');
  ctx.fillStyle = '#2a2d36'; ctx.fillRect(0, 0, cv.width, cv.height);
  const sc = new T.Scene(); sc.environment = g.scene.environment; sc.environmentIntensity = 0.6;
  sc.add(new T.HemisphereLight(0xdfe8ff, 0x2a2430, 1.5)); const k = new T.DirectionalLight(0xffffff, 2.2); k.position.set(2, 4, 5); sc.add(k);
  const cam = new T.PerspectiveCamera(30, 1, 0.05, 200);
  const rt = new T.WebGLRenderTarget(S, S, { samples: 4 }); rt.texture.colorSpace = T.SRGBColorSpace;
  const buf = new Uint8Array(S * S * 4); const id = ctx.createImageData(S, S);
  const rider = await g.makeRider ? null : null;
  const stats = [];
  for (let fi = 0; fi < rows; fi++) for (let ck = 0; ck < 4; ck++) {
    const d = g.generateDesign('测试机甲', '我', { form: FORMS[fi], seed: 1000 + fi * 7 + ck }); d.look.cockpit = ck;
    const v = g.createView(d);
    try { v.setRider(await window.__G_rider()); } catch (e) { stats.push(String(e)); }
    sc.add(v.root); v.root.updateMatrixWorld(true);
    const head = new T.Vector3(); (v.rider?.B.head || v.anchors.seat).getWorldPosition(head);
    const seat = new T.Vector3(); v.anchors.seat.getWorldPosition(seat);
    const s = new T.Vector3(); v.anchors.seat.getWorldScale(s);
    const tgt = head.clone().lerp(seat, 0.45); const H = 2.6 * s.x;
    for (let a = 0; a < 2; a++) {
      const dir = a === 0 ? new T.Vector3(0, 0.12, 1) : new T.Vector3(0.75, 0.22, 0.65); dir.normalize();
      const dist = (H / 2) / Math.tan(T.MathUtils.degToRad(15));
      cam.position.copy(tgt).addScaledVector(dir, dist); cam.lookAt(tgt); cam.updateProjectionMatrix();
      R.setRenderTarget(rt); R.setClearColor(0x2a2d36, 1); R.clear(); R.render(sc, cam); R.readRenderTargetPixels(rt, 0, 0, S, S, buf);
      for (let y = 0; y < S; y++) id.data.set(buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
      ctx.putImageData(id, (ck * 2 + a) * S, fi * S);
    }
    sc.remove(v.root);
  }
  R.setRenderTarget(null);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
  for (let fi = 0; fi < rows; fi++) ctx.fillText(FORMS[fi], 4, fi * S + 14);
  for (let ck = 0; ck < 4; ck++) ctx.fillText('ck' + ck, ck * 2 * S + S - 14, 12);
  window.__ckerr = stats.slice(0, 3); return cv.toDataURL('image/png');
}
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 405, 'height': 720})
        await pg.goto('http://localhost:5198/mockup/?test&q=low')
        for _ in range(150):
            await pg.wait_for_timeout(1000)
            if await pg.evaluate("() => !!(window.__G && window.__G.G.phase && window.__G.G.phase !== 'boot')"): break
        await pg.evaluate("() => { window.__G_rider = () => window.__G.makeRider(0); }")
        url = await pg.evaluate(JS)
        print(await pg.evaluate('() => window.__ckerr'))
        import base64
        open(OUT, 'wb').write(base64.b64decode(url.split(',')[1]))
        await b.close()
asyncio.run(main())
