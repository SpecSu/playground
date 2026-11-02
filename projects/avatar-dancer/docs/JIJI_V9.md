# Jiji v9：原照片重建面部与帽子

## 本轮变更
- 三套服装共用一张直接从原照紧裁重建的新脸。不是把三分之四照片平贴正面，不沿用旧版眼神朝上/牙条表情。
- 红帽保留原设计，整体下移 0.020 raw unit；绿色为机能报童帽，白色为贝雷帽（附件下移 0.005）。
- 面部只做统一 0.175 等比尺度与刚体平移；不压扁头、不任意拉五官。
- 旧纸片颈桥被完整供体下颈替代，最下端在 Head/Neck 间平滑赋权；原 23 骨和三舞蹈曲线保留。
- 仅清理旧 BODY 后侧上发残根/白套贴脸红片，以及帽后封口突出边；保护区 10,921 个供体顶点在最后清理前后 POSITION 精确一致。

## 资产与性能
唯一交付集见 `qa/jiji-v9/receipt.json`。high/low 使用同样几何、骨骼、动作，仅纹理压缩不同：diffuse 2K/1K，normal/ORM 1K/512。
单角色约 7–8 万三角形、5–6 个材质 primitive。纹理解码含 mip 估计：红高96 MiB、低24 MiB；绿白高64 MiB、低16 MiB。这不是实测 GPU VRAM 或 FPS。

保持旧身体舞台缩放的 manifest height：
- 红：1.864636853695773
- 绿：1.7810782778154755
- 白：1.767772866167895

公式为 oldManifestHeight × newRawHeight / oldRawHeight；不是将各套全部写 1.9。

## 验证与边界
`FROZEN_PROOF.json` 对三套验证：high/low 全部 accessor 精确相同；节点、逆绑定矩阵、三动作的 channel 和全部 keyframe 数组精确等于各自 v8 baseline。最终实际三动作离线渲染另经审查。

不要宣称模型数学上完全水密。供体在 rounded-position 检查仍有30条极微边，最长源坐标 .01028，乘 .175 后约1.8mm；原始生成供体本身也有5条、最长 .02056。宏观裁口已用显式三角封闭，实际颈部前/侧/后与动作中未见宏观空洞。旧 `test_neck_attachment.py` 假设 primitive 1 是旧颈桥，不能直接当本版完整供体的断言。

面部相似度仍受单张3/4照片重建限制，不能宣称真人扫描或完全一致。离线 Blender/CPU 蒙皮一致不代表已测浏览器 GPU 帧率。

## 来源与成本
Tripo任务 `74d338af-5dd7-43a0-930f-b0d8d47fac0e`，H-series `v3.1-20260211`，一次40积分；B账户1325→1285。无额外rig/dance收费、无付费重试。密钥与原照片不在仓库/公开素材中。
原始新生成静态头已单独私有Library备份：`libfile_ebb5df44bc6c819190c68b75ff23619d`（jiji-face-v9.glb）。这是生成模型，不是原相册照片。

## 重放脚本
`scripts/jiji_v9/` 保存实际使用的脚本。它们是离线构建工具，不在浏览器执行，不访问网络或凭证。
重放需要在 repo 的父级工作区放置：
1. `dance-stage/`（本仓库及现有依赖脚本）；
2. `jiji-v9/baseline/jiji-{0,1,2}.glb`（v8发布版本）；
3. `dance-stage-work/tripo/jiji-face-v9.glb`（上列Library备份）；
4. 将本目录脚本复制到 `jiji-v9/`，帽脚本到 `jiji-hats-v9/apply_hats.py`。
`prepare_donor.py` 首行工作区 root 需匹配本机工作区路径。使用 Blender 4.3.2 执行，然后从工作区运行 `python jiji-v9/build_final.py candidate-cleanup`。`verify_frozen.py` 复验该目录并写证明。
首次非平面大n-gon封口导出失败的版本已丢弃；最终使用显式三角封口。失败试验、旧候选、参考照片和大渲染不随仓库交付。
