#!/usr/bin/env python3
"""一次性迁移：把 build_mockup.py 里依赖压缩变量名的补丁全部落回 src/，
让 src 成为唯一真相（新增机型后重新构建，压缩变量名变化也不怕）。
运行一次即可；运行后 build_mockup.py 改为：vite build -> CSS 处理 -> 防缓存。"""
import re, os, sys, glob
sys.path.insert(0, os.path.dirname(__file__))
import recolor as R
R.TARGET['pink'], R.TARGET['lime'] = (74, 1.0, 0.72), (333, 0.87, 0.69)  # 与 build_mockup 相同：主次对调


def edit(path, pairs):
    s = open(path).read()
    for o, n in pairs:
        c = s.count(o)
        assert c == 1, (path, c, o[:80])
        s = s.replace(o, n)
    open(path, 'w').write(s)


# ---------- 1. 全局配色：带引号的 hex / rgba 字面量按新色系映射（与旧构建脚本对产物做的完全一致）
for f in glob.glob('src/**/*.js', recursive=True):
    s = open(f).read()
    n = re.sub(r'(?<=["\'])#[0-9a-fA-F]{3,8}(?=["\'])', R.sub_hex, s)
    n = re.sub(r'(rgba?)\(([0-9 ,.]+)\)', R.sub_rgba, n)
    if n != s: open(f, 'w').write(n); print('recolor', f)

# ---------- 2. main.js：创建面板预览光照 / 曝光 / 转台光圈 / 连点生成防堆叠 / bloom
edit('src/main.js', [
    ("""  pv.scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x221a28, 0.8));
  const k = new THREE.DirectionalLight(0xffffff, 2.6); k.position.set(4, 8, 6); pv.scene.add(k);
  const r1 = new THREE.DirectionalLight(0xff3d7f, 1.6); r1.position.set(-6, 3, -5); pv.scene.add(r1);
  const r2 = new THREE.DirectionalLight(0x3dc8ff, 1.6); r2.position.set(6, 3, -5); pv.scene.add(r2);""",
     """  // 预览光照对齐擂台实际灯光（所见即所得）：半球 + 暖白主光 + 玫红/黄绿轮廓 + 冷补光 + 舞台彩色顶灯轻染色
  pv.scene.add(new THREE.HemisphereLight(0x8fa6ff, 0x1a1020, 0.55));
  const k = new THREE.DirectionalLight(0xfff1e0, 2.3); k.position.set(6, 22, 9); pv.scene.add(k);
  const r1 = new THREE.DirectionalLight(0xf569a8, 0.9); r1.position.set(-14, 7, -10); pv.scene.add(r1);
  const r2 = new THREE.DirectionalLight(0xdeff72, 0.9); r2.position.set(14, 6, -8); pv.scene.add(r2);
  const fl = new THREE.DirectionalLight(0x9aa8ff, 0.5); fl.position.set(0, 5, 18); pv.scene.add(fl);
  [[0xf569a8, -1], [0xdeff72, 1], [0x7fe5cd, 0]].forEach(([c, kx]) => { const L = new THREE.DirectionalLight(c, 0.35); L.position.set(kx * 5, 14, -4); pv.scene.add(L); });"""),
    ("new THREE.MeshBasicMaterial({ color: 0x3dc8ff })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; pv.scene.add(ring); pv.ring = ring;",
     "new THREE.MeshBasicMaterial({ color: 0xdeff72, transparent: true, opacity: 0.45 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; pv.scene.add(ring); pv.ring = ring;"),
    ("  pv.ring.material.color.setHSL((performance.now() / 4000) % 1, 0.8, 0.6);\n", ""),
    ("pvR.toneMappingExposure = 1.1;", "pvR.toneMappingExposure = 0.98;"),
    ("pv.scene.environmentIntensity = 0.6;", "pv.scene.environmentIntensity = 0.55;"),
    ("""  if (pv.view) { pv.scene.remove(pv.view.root); pv.view.dispose(); pv.view = null; }
  setTimeout(async () => {
    const d = generateDesign(prompt, '我');""",
     """  if (pv.view) { pv.scene.remove(pv.view.root); pv.view.dispose(); pv.view = null; }
  // 连点「随机 / 换一个」：只认最后一次点击，加新模型前先销毁当前模型，避免堆叠
  const tk = pv.tok = (pv.tok || 0) + 1;
  setTimeout(async () => {
    if (tk !== pv.tok) return;
    if (pv.view) { pv.scene.remove(pv.view.root); pv.view.dispose(); pv.view = null; }
    const d = generateDesign(prompt, '我');"""),
    ("new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.86)", "new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.35, 0.94)"),
    ("bloom.strength = 0.5 + (G.timeScale < 0.6 ? 0.25 : 0)", "bloom.strength = 0.38 + (G.timeScale < 0.6 ? 0.18 : 0)"),
])

# ---------- 3. arena.js：轮廓光 / 角柱 / 围绳 / LED / 地面光圈 / 顶灯 / 观众荧光棒
edit('src/world/arena.js', [
    ("new THREE.DirectionalLight(0xff3d7f, 1.5); rimA", "new THREE.DirectionalLight(0xf569a8, 0.9); rimA"),
    ("new THREE.DirectionalLight(0x3dc8ff, 1.5); rimB", "new THREE.DirectionalLight(0xdeff72, 0.9); rimB"),
    ("new THREE.MeshBasicMaterial({ color: 0xff2e6a }));\n    led.position.y", "new THREE.MeshBasicMaterial({ color: 0xb84d7e }));\n    led.position.y"),
    ("const padCols = [0xff2e55, 0x2e9bff, 0xf5f5f5, 0xf5f5f5];", "const padCols = [0x9e3f6b, 0x8fa63c, 0xf5f5f5, 0xf5f5f5]; // 压暗的玫红/黄绿，避免受光泛光"),
    ("emissive: padCols[i], emissiveIntensity: i < 2 ? 0.25 : 0.04 }", "emissive: padCols[i], emissiveIntensity: 0 }"),
    ("new THREE.MeshBasicMaterial({ color: i < 2 ? padCols[i] : 0xffffff })", "new THREE.MeshBasicMaterial({ color: i < 2 ? 0xb0b0b0 : 0xffffff })"),
    ("const ropeCols = [0xff2e6a, 0xffffff, 0x2ec5ff];", "const ropeCols = [0xf569a8, 0xffffff, 0xdeff72];"),
    ("emissive: ropeCols[k], emissiveIntensity: 1.1,", "emissive: ropeCols[k], emissiveIntensity: ropeCols[k] === 0xffffff ? 0.3 : 0.2,"),
    ("new THREE.MeshBasicMaterial({ color: 0x3dc8ff, transparent: true, opacity: 0.55, blending", "new THREE.MeshBasicMaterial({ color: 0xdeff72, transparent: true, opacity: 0.28, blending"),
    ("const palette = [[1, 0.2, 0.45], [0.2, 0.8, 1], [1, 0.85, 0.3], [0.7, 0.4, 1], [1, 1, 1]];",
     "const palette = [[0.961, 0.412, 0.659], [0.871, 1, 0.447], [1, 0.882, 0.208], [0.718, 0.643, 1], [0.498, 0.898, 0.804]];"),
    ("const cols = [0xffffff, 0xff4d8a, 0x4dc3ff, 0xffffff, 0xffc04d, 0x9d6bff, 0xffffff, 0x4dffc3];",
     "const cols = [0xffffff, 0xf569a8, 0xdeff72, 0xffffff, 0xffe135, 0xb7a4ff, 0xffffff, 0x7fe5cd];"),
])

# ---------- 4. textures.js：地面 logo 字体 / 围裙横幅文字限宽
s = open('src/render/textures.js').read()
s, n1 = re.subn(r"g\.font = `900 \$\{W \* 0\.09\}px Arial Black, Arial, sans-serif`", "g.font = `italic 400 ${W * 0.09}px ArenaCond, Impact, sans-serif`", s)
s, n2 = re.subn(r"g\.font = `800 \$\{W \* 0\.045\}px Arial, sans-serif`; ", "g.font = `italic 400 ${W * 0.045}px ArenaCond, Impact, sans-serif`; g.letterSpacing = '2px'; ", s)
s, n3 = re.subn(r"g\.fillText\(s, seg \* \(i \+ 0\.5\), h \* 0\.5\)", "g.fillText(s, seg * (i + 0.5), h * 0.5, seg * 0.86)", s)
assert n1 == n2 == n3 == 1, (n1, n2, n3)
open('src/render/textures.js', 'w').write(s)

# ---------- 5. mech.js：缎面金属漆 + 发光收档
edit('src/mech/mech.js', [
    ("rough: fin.rough, metal: L.pMetal ? 1 : fin.metal,", "rough: L.pMetal ? Math.max(fin.rough, 0.42) : fin.rough, metal: L.pMetal ? 0.55 : fin.metal,"),
    ("patEmis: PAT_EMIS.has(L.pattern) ? pal.emissive : '#000'", "patEmis: PAT_EMIS.has(L.pattern) ? new THREE.Color(pal.emissive).multiplyScalar(0.32) : '#000'"),
    ("rough: L.sMetal ? 0.22 : fin.rough + 0.05, metal: L.sMetal ? 1 : fin.metal,", "rough: L.sMetal ? 0.4 : fin.rough + 0.05, metal: L.sMetal ? 0.55 : fin.metal,"),
    ("G: glowMaterial(pal.emissive, 3.2 * L.lights),", "G: glowMaterial(new THREE.Color(pal.emissive).getHSL({}).l > 0.85 ? new THREE.Color(pal.emissive).multiplyScalar(0.7) : pal.emissive, 1.25 * L.lights),"),
])

# ---------- 6. director.js：WINNER 镜头正面对准驾驶员，脸在上 1/3
edit('src/game/director.js', [
    ("""      W.target.set(f.x, f.y + h * 0.6, f.z);
      W.yaw = this.winYaw + a * 0.55 + Math.min(1, a) * 0.4; W.pitch = 0.1 + 0.06 * Math.sin(a * 0.9); W.dist = 4.0 + h * (1.0 - 0.12 * Math.min(1, a / 2));""",
     """      // 锁定胜者正前方 ±30° 缓慢摇摆，略俯视对准驾驶舱座位；构图：驾驶员脸在画面上 1/3，WINNER 字在下 1/3
      const s = this.focus.v.anchorWorld && this.focus.v.anchorWorld('seat');
      W.yaw = f.yaw + 0.5 * Math.cos(a * 0.4); W.pitch = 0.2 + 0.04 * Math.sin(a * 0.7); W.dist = 3 + h * (0.6 - 0.08 * Math.min(1, a / 2));
      W.target.set(s ? s.x : f.x, (s ? s.y + 0.45 : f.y + h * 0.75) - 0.5 * Math.tan(0.384) * W.dist, s ? s.z : f.z);"""),
])

# ---------- 7. avatars.js：胜利庆祝 = 手握操纵杆 + 摇头晃脑
edit('src/avatar/avatars.js', [
    ("""    rot('spine', this.lean * 0.5 + this.slump * 0.5, 0, Math.sin(t * 17) * this.shake * 0.2);
    rot('chest', bob + this.lean * 0.4 - this.cheer * 0.2, Math.sin(t * 3) * 0.2 * this.cheer, 0);
    rot('head', -bob + this.slump * 0.6, Math.sin(t * 0.7) * 0.25 * (1 - this.cheer), this.cheer * Math.sin(t * 6) * 0.2);""",
     """    // 庆祝：双手保持在操纵杆上（座舱小，举手必穿模），改为身体摇摆 + 胸口轻跳 + 点头 + 歪头
    rot('spine', this.lean * 0.5 + this.slump * 0.5, 0, Math.sin(t * 17) * this.shake * 0.2 + Math.sin(t * 5) * 0.12 * this.cheer);
    rot('chest', bob + this.lean * 0.4 - this.cheer * (0.08 + 0.06 * Math.abs(Math.sin(t * 10))), Math.sin(t * 2.5) * 0.15 * this.cheer, Math.sin(t * 5) * 0.1 * this.cheer);
    rot('head', -bob + this.slump * 0.6 + this.cheer * (0.14 * Math.sin(t * 10) - 0.05), Math.sin(t * 0.7) * 0.25 * (1 - this.cheer) + Math.sin(t * 2.5) * 0.3 * this.cheer, this.cheer * Math.sin(t * 5 + 0.6) * 0.22);"""),
    ("""      rot('upperArm_L', 0, 0, (-2.0 + w) * c); rot('upperArm_R', 0, 0, (2.0 + w) * c);
      rot('forearm_L', 0, 0, -0.6 * c); rot('forearm_R', 0, 0, 0.6 * c);""",
     """      rot('upperArm_L', 0, 0, 0); rot('upperArm_R', 0, 0, 0);
      rot('forearm_L', 0, 0, 0); rot('forearm_R', 0, 0, 0);"""),
])

# ---------- 8. design.js：v13 配色规则
edit('src/mech/design.js', [
    ("import { mulberry32, hashStr, clamp } from '../core/util.js';",
     "import { mulberry32, hashStr, clamp } from '../core/util.js';\nimport { makePaletteV13 } from '../../tools/palette-lab/rule_v13.js';"),
    ("""  const palette = {
    primary: hslToHex(sc.p), secondary: hslToHex(sc.s), accent: hslToHex(sc.a), emissive: hslToHex(sc.e),
    emissive2: hslToHex(sc.e2 || sc.e), metal: hslToHex(sc.m),
  };""",
     """  // v13 配色规则（tools/palette-lab/rule_v13.js）：鲜艳色≤2 且一主一次、明度分层、左右对称涂装
  const pal13 = makePaletteV13(r, null, k.hues.length ? hue : null);
  const palette = pal13.palette;"""),
    ("scheme: schemeName, finish: sc.finish, pattern: sc.pattern, worn: sc.worn || r.range(0, 0.4), pMetal: !!sc.pMetal, sMetal: !!sc.sMetal,",
     "scheme: schemeName, finish: pal13.finish, pattern: pal13.pattern, worn: pal13.worn, pMetal: pal13.pMetal, sMetal: pal13.sMetal,"),
])
print('ported')
