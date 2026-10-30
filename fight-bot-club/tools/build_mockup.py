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

D = 'dist'; M = 'dist/mockup'
shutil.rmtree(M, ignore_errors=True); os.makedirs(M)
for f in ('index.html', 'assets', 'fonts'):
    src = f'tools/v6_base/{f}' if f != 'fonts' else f'{D}/{f}'  # 始终以 v6 原始产物为输入
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
js = open(f'{M}/assets/{js_f}').read()
js = re.sub(r'(?<=["\'])#[0-9a-fA-F]{3,8}(?=["\'])', R.sub_hex, js)
js = re.sub(r'(rgba?)\(([0-9 ,.]+)\)', R.sub_rgba, js)
js = re.sub(r'0x3dc8ff', '0xF569A8', js); js = re.sub(r'0xff3d6e', '0xDEFF72', js)
old = re.search(r'const (\w+)=\{primary:(\w+)\((\w+)\.p\),secondary:\2\(\3\.s\),accent:\2\(\3\.a\),emissive:\2\(\3\.e\),emissive2:\2\(\3\.e2\|\|\3\.e\),metal:\2\(\3\.m\)\}', js)
assert old, 'palette pattern not found'
v, fn, sc = old.groups()
# 机甲配色：主色在五色色板内均匀随机，副色取另一色；
#  - 高饱和亮色部位（发光/点缀/亮饰件） -> 主色/副色
#  - 棕红/暗红/土黄等中高饱和的暗"脏色" -> 副色（色板色块）
#  - 低饱和带色相的灰 -> 拉成冷调中性灰（和色板更搭）
#  - 金属/中性灰 -> 保持
inject = (f'const {v}=(()=>{{const P=[["#DEFF72",74],["#FFE135",51],["#7FE5CD",166],["#B7A4FF",252],["#F569A8",333]];'
          f'const r=Math.floor(Math.random()*5),c=P[r][0],th=P[r][1];'
          # 大面积（主体/副体）：一律回到金属/黑/白/低饱和；原本已是中性色保持不变，带色的压到极低饱和并轻微带一点主题色相，保证和点缀色协调
          f'const body=x=>!x?x:x.s<=0.12?{fn}(x):{fn}({{h:th,s:0.07,l:x.l>0.7?0.86:x.l<0.18?0.1:Math.min(Math.max(x.l,0.22),0.58)}});'
          # 小面积点缀（accent）：原本是亮色才换主题色；棕红/暗红/土黄等暗脏色改成中性钢灰
          f'const acc=x=>!x?c:(x.s>0.45&&x.l>0.32)?c:x.s>0.12?{fn}({{h:220,s:0.05,l:Math.min(Math.max(x.l,0.3),0.6)}}):{fn}(x);'
          f'return{{primary:body({sc}.p),secondary:body({sc}.s),accent:acc({sc}.a),emissive:c,emissive2:c,metal:{fn}({sc}.m)}}}})()')
js = js.replace(old.group(0), inject)
# —— v12 机甲随机配色规则：内联 tools/palette-lab/rule_v12.js，替换上面的配色注入
#    rnd 用设计生成器的种子随机数 i（同一种子结果可复现），颜色关键词色相 ce 传给规则
_rule = open('tools/palette-lab/rule_v13.js').read()
_rule = _rule.replace('export function makePaletteV13', 'function __mkPal12').replace('export const PLAN_COUNT = 5;', '')
_i = js.index(f'const {v}=(()=>{{const P=')
js = js[:_i] + _rule + f'\nconst __g12=__mkPal12(i,null,a.hues.length?ce:null);const {v}=__g12.palette/*v12-end*/' + js[_i:]
# 去掉旧注入表达式
_s = js.index('/*v12-end*/') + len('/*v12-end*/'); _e = js.index('})()', _s) + 4
assert js[_s:_s+40].startswith(f'const {v}=(()=>'), js[_s:_s+40]
js = js[:_s] + js[_e:]
_o = 'scheme:j,finish:ae.finish,pattern:ae.pattern,worn:ae.worn||i.range(0,.4),pMetal:!!ae.pMetal,sMetal:!!ae.sMetal'
assert js.count(_o) == 1, 'look pattern'
js = js.replace(_o, 'scheme:j,finish:__g12.finish,pattern:__g12.pattern,worn:__g12.worn,pMetal:__g12.pMetal,sMetal:__g12.sMetal')

# —— 涂装左右镜像对称：图案采样坐标 x 取绝对值，任何花纹都左右一致（杜绝阴阳配色）
_o = 'vec2 pattern(vec3 p){\n'; assert js.count(_o) == 1, 'pattern fn'
js = js.replace(_o, 'vec2 pattern(vec3 p){\n  p.x = abs(p.x);\n')
# —— 创建面板 3D 预览光照：对齐擂台实际灯光（所见即所得）
#    擂台：半球光 0x8fa6ff/0x1a1020 .55 · 暖白主光 0xfff1e0 2.3（右上前）· 玫红/黄绿轮廓光各 .9（左后/右后）· 冷补光 .5（正前）
#    环境反射 .55 · 曝光 .98；预览原来是 .8 冷半球 + 2.6 纯白主光 + 1.6 双色轮廓 + 曝光 1.1 + 环境 .6，整体偏亮偏冷、轮廓色还是旧的红蓝
_o = 'Ge.scene.add(new ro(12374271,2234920,.8));const s=new Gn(16777215,2.6);s.position.set(4,8,6),Ge.scene.add(s);const e=new Gn(16727423,1.6);e.position.set(-6,3,-5),Ge.scene.add(e);const t=new Gn(4049151,1.6);t.position.set(6,3,-5),Ge.scene.add(t);'
assert js.count(_o) == 1, 'preview lights'
js = js.replace(_o, 'Ge.scene.add(new ro(9414399,1708064,.55));const s=new Gn(16773600,2.3);s.position.set(6,22,9),Ge.scene.add(s);const e=new Gn(16083368,.9);e.position.set(-14,7,-10),Ge.scene.add(e);const t=new Gn(14614386,.9);t.position.set(14,6,-8),Ge.scene.add(t);const fl=new Gn(10135807,.5);fl.position.set(0,5,18),Ge.scene.add(fl);'
                + '[[16083368,-1],[14614386,1],[8381901,0]].forEach(([c,k])=>{const L=new Gn(c,.35);L.position.set(k*5,14,-4),Ge.scene.add(L)});')  # 舞台彩色顶灯的轻微染色
_o = 'hi.toneMappingExposure=1.1'; assert js.count(_o) == 1; js = js.replace(_o, 'hi.toneMappingExposure=.98')
_o = 'Ge.scene.environmentIntensity=.6'; assert js.count(_o) == 1; js = js.replace(_o, 'Ge.scene.environmentIntensity=.55')
# 预览转台光圈：不再彩虹循环，固定为擂台地面同款亮黄绿低透明
_o = 'Ge.ring.material.color.setHSL(performance.now()/4e3%1,.8,.6),'; assert js.count(_o) == 1; js = js.replace(_o, '')
_o = 'new Ht({color:4049151}));i.rotation.x=Math.PI/2,i.position.y=.01,Ge.scene.add(i),Ge.ring=i'
assert js.count(_o) == 1, 'ring'
js = js.replace(_o, 'new Ht({color:14614386,transparent:!0,opacity:.45}));i.rotation.x=Math.PI/2,i.position.y=.01,Ge.scene.add(i),Ge.ring=i')

# 舞台顶部彩灯：白色保留，其余换新色系（玫红/亮黄绿/香蕉黄/淡紫/薄荷青）
_old='[16777215,16731530,5096447,16777215,16760909,10316799,16777215,5111747]'
_new='[16777215,%d,%d,16777215,%d,%d,16777215,%d]' % tuple(int(x,16) for x in ('F569A8','DEFF72','FFE135','B7A4FF','7FE5CD'))
assert _old in js, 'stage light array not found'; js = js.replace(_old, _new)
# 观众席荧光棒小灯：统一为新色系五色
_old='[[1,.2,.45],[.2,.8,1],[1,.85,.3],[.7,.4,1],[1,1,1]]'
_rgb=lambda h:'[%s]'%','.join(('%.3f'%(int(h[i:i+2],16)/255)).rstrip('0').rstrip('.') for i in (0,2,4))
_new='['+','.join(_rgb(h) for h in ('F569A8','DEFF72','FFE135','B7A4FF','7FE5CD'))+']'
assert _old in js, 'crowd light palette not found'; js = js.replace(_old, _new)
# 擂台两侧轮廓光：左玫红、右亮黄绿（外圈光环保持不变）
_old='new Gn(16727423,1.5);h.position.set(-14,7,-10),e.add(h);const d=new Gn(4049151,1.5)'
_new='new Gn(%d,1.5);h.position.set(-14,7,-10),e.add(h);const d=new Gn(%d,1.5)' % (0xF569A8, 0xDEFF72)
assert _old in js, 'rim lights not found'; js = js.replace(_old, _new)
# 擂台：角柱/围绳/地板光圈 红->玫红 蓝->亮黄绿，白色不变
for _o,_n in [('l=[16723541,3054591,16119285,16119285]','l=[16083368,14614386,16119285,16119285]'),
              ('color:16723562}));o.position.y=-.27','color:%d}));o.position.y=-.27' % 0xB84D7E),
              ('const p=[16723562,16777215,3065343]','const p=[16083368,16777215,14614386]'),
              ('new Ht({color:4049151,transparent:!0,opacity:.55','new Ht({color:14614386,transparent:!0,opacity:.55')]:
    assert _o in js, _o; js = js.replace(_o, _n)
# 擂台围裙横幅：每段文字限制在分段宽度内，避免相互重叠
_o='c.fillText(u,h*(p+.5),t*.5)}'
assert _o in js, _o; js = js.replace(_o, 'c.fillText(u,h*(p+.5),t*.5,h*.86)}')
# 地面 logo：UGC / ROBOT ARENA 换成 TAP 同款字体（ArenaCond 斜体），颜色/大小不变
for _o,_n in [('font=`900 ${s*.09}px Arial Black, Arial, sans-serif`,t.textAlign="center",t.textBaseline="middle",t.fillText("UGC"',
               'font=`italic 400 ${s*.09}px ArenaCond, Impact, sans-serif`,t.textAlign="center",t.textBaseline="middle",t.fillText("UGC"'),
              ('font=`800 ${s*.045}px Arial, sans-serif`,t.fillStyle="rgba(',
               'font=`italic 400 ${s*.045}px ArenaCond, Impact, sans-serif`,t.letterSpacing="2px",t.fillStyle="rgba(')]:
    assert _o in js, _o; js = js.replace(_o, _n)
# —— 光感回调：新色系是高亮度粉彩色（亮黄绿亮度≈0.9），越过 bloom 阈值 0.86 后整片泛光，
#    沿用 v6 的发光强度会严重过曝。按亮度比例收回发光强度，并让角柱不再发光。
for _o,_n in [
    # 角柱护垫：去掉自发光（v6 的 .25 在新亮色下会被 bloom 放大）
    ('emissiveIntensity:x<2?.25:.04', 'emissiveIntensity:0'),
    # 角柱顶灯：原为不受光照的纯亮色球 -> 改为白色中性
    ('new Ht({color:x<2?l[x]:16777215})', 'new Ht({color:x<2?11579568:16777215})'),
    # 围绳：发光强度 1.1 -> 0.42（新颜色亮度约为旧色 2 倍，保持 v6 视觉亮度且不外溢）
    ('color:p[f],emissive:p[f],emissiveIntensity:1.1', 'color:p[f],emissive:p[f],emissiveIntensity:p[f]===16777215?.3:.2'),
    # 地面光圈（加色混合）不透明度 .55 -> .28
    ('transparent:!0,opacity:.55', 'transparent:!0,opacity:.28'),
    # 机甲自发光：3.2 -> 1.6；花纹发光同步压暗
    ('G:g_(t.emissive,3.2*n.lights)', 'G:g_(t.emissive,1.6*n.lights)'),
    ('patEmis:Uu.has(n.pattern)?t.emissive:"#000"', 'patEmis:Uu.has(n.pattern)?new Ee(t.emissive).multiplyScalar(.45):"#000"'),
    # 两侧轮廓光 1.5 -> 0.9
    ('new Gn(16083368,1.5);h.position', 'new Gn(16083368,.9);h.position'),
    ('const d=new Gn(14614386,1.5)', 'const d=new Gn(14614386,.9)'),
]:
    assert _o in js, _o; js = js.replace(_o, _n)
# Bloom：新粉彩色在受光后亮度普遍 >0.86，阈值提到 .94、强度收一档，只让真正的高光泛光
for _o,_n in [('256,256),.55,.5,.86)','256,256),.42,.35,.94)'),
              ('.strength=.5+(W.timeScale<.6?.25:0)','.strength=.38+(W.timeScale<.6?.18:0)'),
              # 角柱护垫底色用压暗的玫红/黄绿，避免受光后泛光
              ('l=[16083368,14614386,16119285,16119285]','l=[%d,%d,16119285,16119285]' % (0x9E3F6B, 0x8FA63C))]:
    assert _o in js, _o; js = js.replace(_o, _n)
# 修复：连续点「随机/换一个」时，多个 700ms 延时回调各自往预览场景加模型导致堆叠。
#   用生成令牌只认最后一次点击，且加新模型前先移除并销毁当前模型。
_o='Ge.view=null),setTimeout(async()=>{const e=Xs(s,"我"),t=Ul(e);'
_n='Ge.view=null),Ge.tok=(Ge.tok||0)+1,((tk)=>setTimeout(async()=>{if(tk!==Ge.tok)return;Ge.view&&(Ge.scene.remove(Ge.view.root),Ge.view.dispose(),Ge.view=null);const e=Xs(s,"我"),t=Ul(e);'
assert js.count(_o)==1, 'gen pattern'
i=js.index(_o); js=js[:i]+_n+js[i+len(_o):]
# 补上 IIFE 结尾：原 "},700)" -> "},700))(Ge.tok)"
j=js.index('},700)', i); js=js[:j]+'},700))(Ge.tok)'+js[j+6:]

# —— v8.1 光污染回调：v13「金属漆」让亮色主/副装甲变成 metalness=1 + 低粗糙度的镜面，
#    环境反射高光大面积越过 bloom 阈值 → 机身整片泛光。改为缎面金属漆，并压一档自发光/白色发光。
for _o,_n in [
    ('rough:i.rough,metal:n.pMetal?1:i.metal', 'rough:n.pMetal?Math.max(i.rough,.42):i.rough,metal:n.pMetal?.55:i.metal'),
    ('rough:n.sMetal?.22:i.rough+.05,metal:n.sMetal?1:i.metal', 'rough:n.sMetal?.4:i.rough+.05,metal:n.sMetal?.55:i.metal'),
    ('G:g_(t.emissive,1.6*n.lights)', 'G:g_(new Ee(t.emissive).getHSL({}).l>.85?new Ee(t.emissive).multiplyScalar(.7):t.emissive,1.25*n.lights)'),
    ('patEmis:Uu.has(n.pattern)?new Ee(t.emissive).multiplyScalar(.45)', 'patEmis:Uu.has(n.pattern)?new Ee(t.emissive).multiplyScalar(.32)'),
]:
    assert js.count(_o) == 1, _o; js = js.replace(_o, _n)

# —— WINNER 镜头：原来从侧面持续环绕，几秒后转到背面只能看到座椅靠背。
#    改为锁定在胜者正前方 ±30° 内缓慢摇摆，略俯视对准驾驶舱座位锚点，看清驾驶员正脸
_o = 'i.target.set(f.x,f.y+x*.6,f.z),i.yaw=this.winYaw+_*.55+Math.min(1,_)*.4,i.pitch=.1+.06*Math.sin(_*.9),i.dist=4+x*(1-.12*Math.min(1,_/2))'
assert js.count(_o) == 1, 'winner cam'
js = js.replace(_o, 'const __s=this.focus.v.anchorWorld&&this.focus.v.anchorWorld("seat");'
                    'i.yaw=f.yaw+.5*Math.cos(_*.4),i.pitch=.2+.04*Math.sin(_*.7),i.dist=3+x*(.6-.08*Math.min(1,_/2)),'
                    # 构图：驾驶员脸放在画面上 1/3（距中心上移 0.4 个半屏高），WINNER 字压到下 1/3
                    'i.target.set(__s?__s.x:f.x,(__s?__s.y+.45:f.y+x*.75)-.5*Math.tan(.384)*i.dist,__s?__s.z:f.z)')
# —— 分身胜利庆祝（v8.5）：手臂动作在小座舱里怎么收都会穿模 → 双手保持在操纵杆上不动，
#    改为摇头晃脑：身体左右摇摆 + 胸口轻跳 + 点头 + 歪头，所有分身统一
_o='l("chest",h+this.lean*.4-this.cheer*.2,Math.sin(i*3)*.2*this.cheer,0),l("head",-h+this.slump*.6,Math.sin(i*.7)*.25*(1-this.cheer),this.cheer*Math.sin(i*6)*.2)'
assert js.count(_o)==1,'cheer body'
js=js.replace(_o,'l("spine",this.lean*.5+this.slump*.5,0,Math.sin(i*17)*this.shake*.2+Math.sin(i*5)*.12*this.cheer),'
  'l("chest",h+this.lean*.4-this.cheer*(.08+.06*Math.abs(Math.sin(i*10))),Math.sin(i*2.5)*.15*this.cheer,Math.sin(i*5)*.1*this.cheer),'
  'l("head",-h+this.slump*.6+this.cheer*(.14*Math.sin(i*10)-.05),Math.sin(i*.7)*.25*(1-this.cheer)+Math.sin(i*2.5)*.3*this.cheer,this.cheer*Math.sin(i*5+.6)*.22)')
_o='l("upperArm_L",0,0,(-2+u)*d),l("upperArm_R",0,0,(2+u)*d),l("forearm_L",0,0,-.6*d),l("forearm_R",0,0,.6*d)'
assert js.count(_o)==1,'cheer arms'
js=js.replace(_o,'l("upperArm_L",0,0,0),l("upperArm_R",0,0,0),l("forearm_L",0,0,0),l("forearm_R",0,0,0)')
open(f'{M}/assets/{js_f}', 'w').write(js)
html = open(f'{M}/index.html').read()
html = re.sub(r'<script type="module" crossorigin src="(\./assets/[^"]+)"></script>', lambda m: '<script>Promise.race([Promise.all([document.fonts.load("italic 40px ArenaCond"),document.fonts.load("40px ArenaCond")]),new Promise(r=>setTimeout(r,2500))]).finally(()=>import("'+m.group(1)+'"))</script>', html).replace('<title>', '<title>[配色模拟稿v4] ', 1)
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
