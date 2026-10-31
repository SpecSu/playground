#!/usr/bin/env python3
"""生成 dist/mockup：基于线上构建产物，只改颜色。
v2: 亮黄绿主色 / 玫红辅色；按钮去渐变去光泽；机甲配色池换成新色系。"""
import re, sys, os, shutil
sys.path.insert(0, os.path.dirname(__file__))
import recolor as R

# 主次对调：原玫红位置 -> 亮黄绿；原青蓝位置 -> 玫红
R.TARGET['pink'], R.TARGET['lime'] = (74, 1.0, 0.72), (333, 0.87, 0.69)
_orig = R.remap
def remap(r, g, b):  # 饱和度分支按新目标处理
    return _orig(r, g, b)

D = 'dist'; M = 'dist/mockup'; B = 'tools/.srcbuild'
# v9：src 已是唯一真相（旧的压缩产物补丁已由 tools/port_v9.py 落回源码），这里现场构建 src 作为输入
import subprocess
subprocess.run(['npx', 'vite', 'build', '--outDir', B, '--emptyOutDir', '--logLevel', 'warn'], check=True)
shutil.rmtree(M, ignore_errors=True); os.makedirs(M)
for f in ('index.html', 'assets', 'fonts'):
    src = f'{B}/{f}' if f != 'fonts' else f'{D}/{f}'
    (shutil.copytree if os.path.isdir(src) else shutil.copy)(src, f'{M}/{f}')
css_f = [f for f in os.listdir(f'{M}/assets') if f.endswith('.css')][0]
js_f = [f for f in os.listdir(f'{M}/assets') if f.endswith('.js')][0]

# ---------- CSS ----------
css = R.recolor(open(f'{M}/assets/{css_f}').read())
def first_color(grad):
    m = re.search(r'#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\)', grad)
    return m.group(0) if m else 'transparent'
GRAD = r'(?:linear|radial)-gradient\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)'
SKIP = ('#assist', '.scanline', '#bottom')  # 底部是渐隐压暗遮罩，不是控件，拍平会变成硬边黑块
def stops(g):
    return re.findall(r'#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\)|color-mix\((?:[^()]|\([^()]*\))*\)|var\(--[\w-]+\)', g)
def solid(g, sel):
    if g.startswith('radial') and '.ai' not in sel: return 'transparent'
    for c in stops(g):
        if re.search(r',\s*0?\.?0\)$', c): continue
        return c
    return 'transparent'
def flatten_block(m):
    sel, body = m.group(1), m.group(2)
    if any(k in sel for k in SKIP) or 'gradient' not in body and 'inset' not in body:
        return m.group(0)
    body = re.sub(r'(?:repeating-)?' + GRAD, lambda g: solid(g.group(0).replace('repeating-',''), sel), body)
    body = re.sub(r'background:\s*transparent(\s*,\s*transparent)+', 'background:transparent', body)
    body = re.sub(r',?\s*inset\s+[^,;}]*', '', body)
    body = re.sub(r'box-shadow:\s*(;|$)', r'box-shadow:none\1', body)
    if re.search(r'button|btn|hp|en-fill|bar', sel): body = re.sub(r'text-shadow:[^;}]*', 'text-shadow:none', body)
    return sel + '{' + body + '}'
css = re.sub(r'([^{}]+)\{([^{}]*)\}', flatten_block, css)
# 亮黄绿底上的白字改成黑字，保证可读
css += '\nbutton.primary,button.primary *{color:#171719!important}\nbutton.primary{box-shadow:none!important;background:#DEFF72!important}\n.hp{border-color:#232126!important;background:#171719!important}.hp-fill{background:#DEFF72!important}.fcard.right .hp-fill{background:#F569A8!important}.hp-lag{background:#F5F4F0!important;opacity:.35}.hp-num{text-shadow:none!important;color:#171719!important}.en-fill{background:#FFE135!important}\n'
css += '''
/* 选角色勾：黑勾 */
.ava.sel::after{color:#171719!important}
/* NEXT 标签：玫红底黑字 */
.qi.next::before{background:#F569A8!important;color:#171719!important;box-shadow:none!important}
/* 副标题为空时不显示底板（K.O. 下方空四边形） */
.b-sub:empty{display:none!important}
/* 大招背景板：玫红纯色 */
#ultcut{background:rgba(245,105,168,.72)!important}
.uc-tag{color:#171719!important}
.uc-name{color:#F5F4F0!important;-webkit-text-stroke-color:#3A0A20!important;text-shadow:3px 3px 0 #171719!important}
.uc-owner{color:#F5F4F0!important;text-shadow:none!important}
/* v10.1 投票模式：条幅跟随获胜方投票色——黄绿方深色字，粉方白字 */
#ultcut.v0{background:rgba(222,255,114,.94)!important}
#ultcut.v0 .uc-tag{color:rgba(23,23,25,.7)!important}
#ultcut.v0 .uc-name{color:#171719!important;-webkit-text-stroke:0!important;text-shadow:2px 2px 0 rgba(255,255,255,.55)!important}
#ultcut.v0 .uc-owner{color:#171719!important}
#ultcut.v0 .uc-ava{box-shadow:0 0 0 3px #171719,0 0 0 6px #F5F4F0,0 6px 18px rgba(0,0,0,.5)!important}
#ultcut.v1{background:rgba(245,105,168,.92)!important}
/* READY / FIGHT：主体白字不变，发光 + 投影改玫红 */
.b-main:not(.ko):not(.win):not(.vs){-webkit-text-stroke-color:#2A0A18!important;text-shadow:0 0 22px rgba(245,105,168,.95),0 0 48px rgba(245,105,168,.5),0 5px 0 #9E3A68,0 10px 26px #000!important}
/* K.O. / WINNER：与 READY/FIGHT 同款样式（白字+细描边+单层发光+实色下投影），仅颜色为香蕉黄；光效收紧不发糊 */
.b-main.ko,.b-main.win{color:#F5F4F0!important;-webkit-text-stroke:2px #2A2405!important;letter-spacing:3px!important;transform:none!important;
  text-shadow:0 0 14px rgba(255,225,53,.85),0 5px 0 #9E8A12,0 10px 22px #000!important}
.b-main.ko{font-size:120px!important}
.b-main.win{font-size:88px!important}
/* VS 报幕：轻量斜切排版，无大块底色，透出场景 */
.b-main.vs{text-shadow:none!important;-webkit-text-stroke:0!important;font-style:normal}
.b-main.vs .vsrow{gap:14px;align-items:center;padding:0 14px}
.b-main.vs .vsn{position:relative;flex:1;font-family:'ArenaCond',Impact,sans-serif;font-style:italic;font-weight:400;font-size:24px;letter-spacing:1px;color:#F5F4F0!important;
  text-shadow:0 2px 0 #171719,0 0 12px rgba(23,23,25,.9)!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-bottom:7px;transform:skewX(-8deg)}
.b-main.vs .vsn::after{content:'';position:absolute;bottom:0;height:2px;width:72%;transform:skewX(-30deg)}
.b-main.vs .vsn.a::after{right:0;background:#F569A8;box-shadow:-10px 0 0 -0.5px #F569A8,-16px 0 0 -0.5px rgba(245,105,168,.5)}
.b-main.vs .vsn.b::after{left:0;background:#DEFF72}
.b-main.vs .vsx{font-family:'ArenaCond',Impact,sans-serif;font-style:italic;font-size:52px;line-height:1;letter-spacing:0;color:#F5F4F0!important;
  -webkit-text-stroke:1.5px #171719;paint-order:stroke fill;text-shadow:-3px 0 0 #F569A8,3px 0 0 #DEFF72,0 6px 14px rgba(0,0,0,.8)!important;transform:skewX(-8deg)}
.b-main.vs + .b-sub{display:table!important;margin:12px auto 0!important;padding:3px 12px!important;font-size:11px!important;font-weight:800;letter-spacing:3px;
  color:rgba(245,244,240,.85)!important;background:rgba(23,23,25,.45)!important;border:1px solid rgba(245,244,240,.18);text-shadow:none!important;
  clip-path:polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%);backdrop-filter:none!important}
/* TAP 大招：统一玫红警戒色 */
#assist{--c:#F569A8!important}
#assist.on{background:radial-gradient(ellipse at 50% 55%,rgba(245,105,168,0) 30%,rgba(245,105,168,.22) 75%,rgba(23,23,25,.6) 100%)!important}
#assist.on::before{box-shadow:inset 0 0 70px 10px #F569A8!important;opacity:.7!important}
.as-ring i{border-color:#F569A8!important}
.as-core{background:rgba(245,105,168,.7)!important;border-color:#F569A8!important;outline-color:#F5F4F0!important}
.as-core b{color:#F5F4F0!important;-webkit-text-stroke-color:#F5F4F0!important}
.as-bar{background:#232126!important}.as-bar i{background:#F569A8!important;box-shadow:none!important}
.as-mult{color:#F569A8!important;text-shadow:2px 3px 0 #171719!important}
.as-tip,.as-count{text-shadow:0 0 10px #F569A8,2px 3px 0 #171719!important}
.as-pop{text-shadow:0 0 10px #F569A8,2px 2px 0 #171719!important}
.slowmo{box-shadow:inset 0 0 160px rgba(245,105,168,.45)!important}
/* WINNER：驾驶员脸在上 1/3，胜利字幕放到下 1/3，互不遮挡 */
#banner:has(.b-main.win){top:47%}
'''
open(f'{M}/assets/{css_f}', 'w').write(css)

# ---------- JS ----------
# 全部改动已在 src 中（配色 / 灯光 / 镜头 / 庆祝动作 / v13 配色规则 / 生成防堆叠），产物不再做字符串补丁
v = fn = sc = '-'
html = open(f'{M}/index.html').read()
html = re.sub(r'<script type="module" crossorigin src="(\./assets/[^"]+)"></script>', lambda m: '<script>Promise.race([Promise.all([document.fonts.load("italic 40px ArenaCond"),document.fonts.load("40px ArenaCond")]),new Promise(r=>setTimeout(r,2500))]).finally(()=>import("'+m.group(1)+'"))</script>', html).replace('<title>', '<title>[配色模拟稿v4] ', 1)
# v10.1：启动页大字需要首帧就出现 —— 把 Anton 字体内联进 HTML，不等网络
import base64
_b64 = base64.b64encode(open('public/fonts/anton.woff2', 'rb').read()).decode()
html = re.sub(r'\s*<link rel="preload" as="font"[^>]*anton[^>]*>', '', html)
html = html.replace('</title>', '</title>\n  <style>@font-face{font-family:ArenaCond;src:url(data:font/woff2;base64,' + _b64 + ') format("woff2");font-display:block}</style>', 1)
open(f'{M}/index.html', 'w').write(html)
print('ok', v, fn, sc)

# 防缓存：资源改名
import time; tag=str(int(time.time()))[-6:]
for f in (css_f, js_f):
    n=f.replace('index-','m'+tag+'-'); os.rename(f'{M}/assets/{f}', f'{M}/assets/{n}')
    h=open(f'{M}/index.html').read().replace(f, n); open(f'{M}/index.html','w').write(h)

# 同步到主程序（dist 根目录）
if '--promote' in sys.argv:
    shutil.rmtree(f'{D}/assets'); shutil.copytree(f'{M}/assets', f'{D}/assets')
    open(f'{D}/index.html','w').write(re.sub(r'\[配色模拟稿v\d\] ', '', open(f'{M}/index.html').read()))
    print('promoted')
