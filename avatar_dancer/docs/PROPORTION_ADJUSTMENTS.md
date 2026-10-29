# 身体比例调整（继颈部闭合修复之后）

用户要求：LX 脖子缩短；吉吉头部缩小。保留既有脸部身份、服装和已闭合颈部。

## 几何处理

- LX 三套：完整头部刚性下移 **0.012 个归一化模型单位**，约减少此前可见后颈长度的五分之一；不压扁脸，不改变头发、眼镜和五官比例。
- 吉吉三套：以原 Head bind pivot 为中心，将整个规范头部、红发与帽饰统一缩到 **88%**。这是相对于未改动服装身体的线性比例，不是仅缩脸或仅缩帽子。
- 连续颈部九圈网格从上缘跟随新头部变换，逐圈衰减至完全不动的底圈及底盖。底部仍埋在原躯干内，上缘位置及权重仍与头部完全一致。
- 原身体顶点、图片、UV、权重、23 骨骼、inverse-bind matrices 和三个动画不变。保留原动画 pivot，必须使用实际舞姿验证，不能仅凭静态截图验收。

## 重建与验证

输入必须是上一版已闭合颈部、尚未进行比例调整的 GLB；脚本拒绝重复累积缩放。

```sh
python scripts/adjust_character_proportions.py BEFORE/lx-0.glb AFTER/lx-0.glb --lowering .012
python scripts/adjust_character_proportions.py BEFORE/jiji-0.glb AFTER/jiji-0.glb --scale .88
python scripts/test_proportion_adjustment.py BEFORE/lx-0.glb AFTER/lx-0.glb
python scripts/optimize_glb.py AFTER/lx-0.glb AFTER/lx-0_low.glb --diffuse-max 1024 --data-max 1024
```

`test_proportion_adjustment.py` 对照输入检查所有头部位置的精确变换、底圈/底盖不动、原身体未动、纹理与动画未变，并复用颈部闭合/权重测试。

`render_proportion_comparison.py` 使用完全相同相机、光线和缩放，生成正/侧/背全身与近景前后对比。`docs/audit/proportions/` 保存对比及动作证据。实际 GLB 离线渲染不等同浏览器或手机实测。
