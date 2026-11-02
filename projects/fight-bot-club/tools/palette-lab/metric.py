# 配色指标：在 3D 渲染后的像素上量化「单一纯色平铺」程度
# 对每台机甲：取机身像素 → 计算 ① 最大单一高饱和色簇占比 ② 明度标准差 ③ 明度三分位占比
import sys, json, colorsys
from PIL import Image
img = Image.open(sys.argv[1]).convert('RGB')
CW, CH, TOP = 400, 370, 80
res = []
for i in range(12):
    col, row = i % 4, i // 4
    x0, y0 = col * CW, TOP + row * CH
    box = img.crop((x0 + 4, y0 + 40, x0 + CW - 4, y0 + CH - 50))
    px = list(box.get_flattened_data())
    bg = px[0]
    body = [p for p in px if abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) > 18]
    n = len(body) or 1
    bins = {}; vals = []
    for r, g, b in body:
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        v = 0.299 * r / 255 + 0.587 * g / 255 + 0.114 * b / 255; vals.append(v)
        if s > 0.35 and 0.25 < l < 0.92:
            k = int(h * 360 // 24); bins[k] = bins.get(k, 0) + 1
    dom = max(bins.values()) / n if bins else 0
    mean = sum(vals) / n; sd = (sum((v - mean) ** 2 for v in vals) / n) ** 0.5
    dark = sum(v < 0.3 for v in vals) / n; mid = sum(0.3 <= v < 0.62 for v in vals) / n; light = sum(v >= 0.62 for v in vals) / n
    res.append(dict(i=i + 1, dom=round(dom, 2), sd=round(sd, 3), dark=round(dark, 2), mid=round(mid, 2), light=round(light, 2)))
for r in res: print(r)
print('MAX_DOM', max(r['dom'] for r in res), 'AVG_DOM', round(sum(r['dom'] for r in res) / 12, 3), 'MIN_SD', min(r['sd'] for r in res))
