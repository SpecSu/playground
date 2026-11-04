# UGC 画廊：python3 fish_test/gallery.py out.png "<JSON 列表 [[sp, [decos], pat|null, pal|null], ...]>"
import asyncio, sys, json
from playwright.async_api import async_playwright
OUT = sys.argv[1]
ITEMS = json.loads(sys.argv[2])
JS = '''async (items) => {
  const G = window.G; const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#dfeef3;display:grid;grid-template-columns:repeat(4,240px);gap:4px;padding:6px;overflow:auto';
  document.body.appendChild(d); const t0 = performance.now();
  let k = 0;
  for (const [spId, decos, pat, pal] of items) {
    const sp = G.SPECIES.find((s) => s.id === spId);
    const v = G.makeVariant(sp, 0); v.id = 'g' + (k++) + Math.random();
    if (decos) v.ugc.decos = decos; if (pat != null) v.ugc.pat = pat; if (pal != null) { v.ugc.pal = pal; }
    v.traits = [];
    const u = G.fishThumb(v);
    const c = document.createElement('div'); c.style.cssText = 'font:11px sans-serif;text-align:center;background:#fff8';
    c.innerHTML = '<img style="width:240px;height:168px;display:block" src="' + u + '">' + sp.name + ' · ' + v.title + ' · ' + v.ugc.decos.join(',');
    d.appendChild(c);
  }
  return performance.now() - t0;
}'''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 1000, 'height': 760}, device_scale_factor=1)
        pg = await ctx.new_page(); logs = []
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') and 'GPU stall' not in m.text and 'GL Driver' not in m.text and 'AudioContext' not in m.text else None)
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.set_default_timeout(240000)
        await pg.goto('http://127.0.0.1:8765/index.html?autostart&dtmax=0.1')
        await pg.wait_for_function('window.G && window.G.player && !document.getElementById("splash")', timeout=120000)
        ms = await pg.evaluate(JS, ITEMS)
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT)
        print('ms', ms); [print(l) for l in logs]
        await b.close()
asyncio.run(main())
