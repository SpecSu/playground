#!/usr/bin/env python3
"""只换颜色、不改样式：把 style.css 里的所有颜色按色相映射到新色系。
用法: python3 tools/recolor.py in.css out.css
映射规则（保留原有明暗层次与透明度）：
  玫红/红系  -> 玫红   #F569A8
  青/蓝系    -> 亮黄绿 #DEFF72
  金/橙系    -> 香蕉黄 #FFE135
  紫系       -> 淡紫   #B7A4FF
  深色底(偏蓝黑)  -> 中性黑灰 #171719 / #232126 系
  浅灰字(偏蓝灰)  -> 暖白灰   #F5F4F0 系
"""
import re, sys, colorsys

TARGET = {  # name: (hue°, sat, light)
    'pink': (333, 0.87, 0.69),   # F569A8
    'lime': (74, 1.0, 0.72),     # DEFF72
    'banana': (51, 1.0, 0.60),   # FFE135
    'violet': (252, 1.0, 0.82),  # B7A4FF
    'mint': (166, 0.66, 0.70),   # 7FE5CD
}
SRC_L = {'pink': 0.62, 'lime': 0.62, 'banana': 0.68, 'violet': 0.6, 'mint': 0.6}  # 原主色亮度（ff3d6e / 3dc8ff / ffd25a）


def classify(h, s, l):
    if s < 0.28 or l < 0.06:
        return None
    if 170 <= h < 260 and l < 0.2:  # 深蓝黑底色归为中性色
        return None
    if h >= 315 or h < 14: return 'pink'
    if 170 <= h < 235: return 'lime'
    if 14 <= h < 60: return 'banana'
    if 60 <= h < 170: return 'mint'
    if 235 <= h < 315: return 'violet'
    return None


def remap(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    H = h * 360
    k = classify(H, s, l)
    if k:
        th, ts, tl = TARGET[k]
        # 相对原主色的明暗关系保持：主色→目标色，暗部按比例更暗，亮部向白靠
        if l <= SRC_L[k]: nl = tl * (l / SRC_L[k])
        else: nl = tl + (1 - tl) * ((l - SRC_L[k]) / (1 - SRC_L[k]))
        ns = ts * min(1, s / 0.85) if k not in ('lime',) else min(1, s * 1.05)
        nh = th
    else:
        # 中性色：偏蓝的冷灰改成参考图的中性/微紫灰（暗）与暖白灰（亮）
        if s > 0 and 170 <= H < 260 and not (r == g == b):
            if l < 0.35: nh, ns, nl = 250, min(s, 0.06), l * 1.15 + 0.02
            else: nh, ns, nl = 45, min(s, 0.06), l
        else:
            return None
    rr, gg, bb = colorsys.hls_to_rgb(nh / 360, max(0, min(1, nl)), max(0, min(1, ns)))
    return round(rr * 255), round(gg * 255), round(bb * 255)


def sub_hex(m):
    t = m.group(0)[1:]
    if len(t) == 3: t = ''.join(c * 2 for c in t)
    if len(t) not in (6, 8): return m.group(0)
    r, g, b = int(t[0:2], 16), int(t[2:4], 16), int(t[4:6], 16)
    n = remap(r, g, b)
    if not n: return m.group(0)
    return '#%02X%02X%02X' % n + (t[6:8] if len(t) == 8 else '')


def sub_rgba(m):
    fn, args = m.group(1), [a.strip() for a in m.group(2).split(',')]
    try: r, g, b = [int(float(x)) for x in args[:3]]
    except ValueError: return m.group(0)
    n = remap(r, g, b)
    if not n: return m.group(0)
    return f"{fn}({n[0]}, {n[1]}, {n[2]}{(', ' + args[3]) if len(args) > 3 else ''})"


def recolor(css):
    css = re.sub(r'#[0-9a-fA-F]{3,8}\b', sub_hex, css)
    css = re.sub(r'(rgba?)\(([^)]*)\)', sub_rgba, css)
    return css


if __name__ == '__main__':
    src = open(sys.argv[1]).read()
    out = recolor(src)
    # 背景底色统一到参考图的黑
    out = out.replace('--bg: #05060c', '--bg: #171719')
    open(sys.argv[2], 'w').write(out)
