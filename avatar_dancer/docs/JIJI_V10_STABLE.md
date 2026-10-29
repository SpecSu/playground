# Jiji v10：用户选择的原生完整模型稳定版

用户在 v9 发现头发破面、衣服破洞后，明确要求先用原来的脸、尽快交付。本版恢复 Git `25c6818` 中原生完整三套 GLB，保留各自原脸、全部原头发、后脑、颈、衣服、23 骨与三段舞蹈；不包含 v9 新供体脸，也不包含任何失败的面部嵌入、补发束或领口实验。

## 修复原因
v9 在融合新短头发与原长发时删除了原 BODY 三角形，造成肩部和长发宏观缺口。先前 Cycles 静态验收没有正确模拟 WebGL FrontSide 剔背，漏检真实问题。此次直接恢复完整原生表面，不使用双面渲染掩盖缺面。

## 帽子
- 绿：按原生完整头型拟合的机能报童帽。
- 白：按原生完整头型拟合的白色贝雷帽。
- 红：保留原有红帽设计，仅提取 v9 红帽壳 primitives 0–2，刚体 X −0.020 适配，不带旧脸、颈、头皮。
- 所有帽子附件绑定 Head 骨；原生唯一 primitive 的 POSITION / NORMAL / UV / JOINTS / WEIGHTS / indices 精确不变。

## 证据与交付
`qa/jiji-v10/receipt.json` 记录唯一六个 GLB、三张实际缩略图、哈希及保持身体屏幕尺寸的 height 参数。
`NATIVE_INTEGRITY_PROOF.json` 验证原生全 primitive 属性和索引、nodes、三舞蹈曲线不变；高低版几何一致，仅纹理规格不同。高版 diffuse 2K / 数据纹理 1K；低版 1K / 512。

近景审查使用 Geometry.Backfacing → Transparent 保守模拟单面剔背。它不是浏览器 GPU 实测，也不证明所有原生模型数学水密。原生模型保留原本生成质量与近似相似度；本版优先可玩、连续完整的外观，不声称真人扫描或新脸优化完成。

## 重放
从 Git `25c6818` 导出 `public/assets/characters/jiji-{0,1,2}.glb` 作 native 输入。从 Git `c5b2ed0` 导出红套 `jiji-0.glb` 作为红帽来源。

```
python scripts/jiji_v10/fit_native_hats.py native-green.glb output-green.glb 1
python scripts/jiji_v10/fit_native_hats.py native-white.glb output-white.glb 2
python scripts/jiji_v10/attach_red_hat.py native-red.glb v9-red.glb output-red.glb
```

之后使用现有 GLB compact / optimize 工具做无损几何整理和纹理压缩。禁止将历史 v9 新脸或任何私有失败试验自动套回本版。
