> HISTORICAL / REJECTED: 用户拒绝此版本，已回滚。当前成品不使用以下头部压缩变形。

# 我的分身：Jiaxin 基础资产（v5）

当前只保留一套黑色长袖 T、白裤、黑皮鞋。此前两套离线材质变体已从当前产品移除；其他妆造只进入定制面板，未接通真实生成。

## 当前资源
- `public/assets/characters/jiaxin-0.glb`：8,061,708 bytes，三张 2K 贴图。
- `public/assets/characters/jiaxin-0_low.glb`：4,115,720 bytes，三张 1K 贴图。
- `public/assets/thumbs/jiaxin-0.webp`：384×512，7,548 bytes，实际模型128采样离线渲染。
- 48,484 三角形，23 根 Mixamo 骨骼，dance_01/03/05 三段舞蹈。
- manifest 身高 1.868307357861884、rotationY=-π/2。因降低发顶，身高参数同步补偿，保持身体在舞台上的原有尺度。
- 贴图 RGBA8+mipmap 估算：高配64 MiB、低配16 MiB，不是实测显存或浏览器 FPS。

## 本轮相貌调整
对原生完整身体进行局部有界修改：降低并柔化过高的发顶、保守调整下半脸与鼻部比例、让细框眼镜更接近圆形并控制尺寸。通过局部源照片投射补充唇、鼻、眉眼细节，嘴唇混合限制在35%，避免过度模糊。未切头、未嫁接、未删除面片，颈部和身体坐标保持不变。

这是单照片参考的近似分身；仍不宣称与本人完全一致，未提供的侧面形状也不是实测还原。主负责人已检查原照/修改前后/45°对比并接受为有界改善。

## 验证与证据
`docs/audit/jiaxin-v5/` 保存冻结哈希、结构检查、修改记录和 CPU 跨引擎蒙皮检查。
- 头颈没有大的开放边界；所有顶点权重归一化。
- 三段舞蹈时长和通道数保持；实际离线三舞姿已目检。
- Three.js 与 Blender 的40个采样点、3动画×3时刻比较通过，最大位置误差约0.00009546。
- 高低配压缩只更改图像数据，几何、骨骼和动画不变。
- 无本轮新增 API 费用。原照和比较图不在 public/dist 中；GLB只含烘焙材质，没有原照嵌入。

## 重现与验证
```sh
python scripts/validate_jiaxin_assets.py public/assets/characters/jiaxin-0.glb public/assets/characters/jiaxin-0_low.glb
node scripts/audit_runtime_skin.mjs public/assets/characters/jiaxin-0.glb /tmp/jiaxin-three.json
blender -b --factory-startup --python-exit-code 1 --python scripts/audit_runtime_skin_blender.py -- /tmp/jiaxin-three.json /tmp/jiaxin-proof.json
```
私有原照取自用户已提供的 Library 文件；不应为了重现而将其复制到公开工程素材。
材质处理脚本：`scripts/refine_jiaxin_v5_texture.py`；有界几何处理：`scripts/refine_jiaxin_likeness.py`。先材质处理、再几何处理。旧 CANONICAL / DONOR_HEAD 嫁接测试不适用于此原生完整身体。
