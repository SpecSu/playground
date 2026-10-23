# 示例 · 八类资产的小岛

本例是本次流程的实际历史，不能作为所有项目的参数或品质保证。参考是用户提供的花草小岛图，目标是移动竖屏微缩模型质感。早期整图转 3D / 程序化修形的失败促使流程改为独立资产生成与逐件验收。

## 追踪一件资产：狗狗

1. [主图](../art/v0.1/assets/dog/primary.png) 确认连贯头颈、五官、服装和四肢；[背图](../art/v0.1/assets/dog/back.png) 是补充设计，先只提交主图。转头的旧背图被淘汰。
2. [geometry.glb](../scene-lab/assets/models/dog/geometry.glb)：47,648 三角面。看 [正面灰模](../scene-lab/evidence/round-01/dog-clay-front.jpg)、[背面](../scene-lab/evidence/round-01/dog-clay-back.jpg)、[侧面](../scene-lab/evidence/round-01/dog-clay-side.jpg)。头身未拆开重摆。
3. [texture.glb](../scene-lab/assets/models/dog/texture.glb) 保存原 PBR，验证 [中性光](../scene-lab/evidence/round-02/dog-pbr-neutral.jpg) 和 [反向光](../scene-lab/evidence/round-02/dog-pbr-reversed-light.jpg)。delight 只是请求参数。
4. [display.glb](../scene-lab/assets/models/dog/display.glb) 将基础色调整到 2K、数据图 1K，原网格不动。
5. 场景中按整体高度 1.55 m、Y 旋转 -90°、真实地表接点装配；不是单独放大头部。
6. [runtime.glb](../scene-lab/assets/models/dog/runtime.glb) 为 21,440 三角面，保留 display 贴图字节；[原近景](../scene-lab/evidence/optimization-v0.4/dog-original.png) / [减面后](../scene-lab/evidence/optimization-v0.4/dog-runtime.png)。
7. [compact.glb](../scene-lab/assets/models/dog/compact.glb) 2.227 MB，normal/材质图无损 WebP，基础色 WebP 95；[压缩前](../scene-lab/evidence/textures-v0.5/dog-before.png) / [压缩后](../scene-lab/evidence/textures-v0.5/dog-after.png)。

仍有尾巴偏长问题；这一流程保住的是当前资产质量，并不自动把它修成原参考的最终造型。

## 追踪整岛

- round-01：灰模发现朝向/连接限制；round-02：样板 PBR 换光向；round-03：首次装配、比例/水位/Shader 错误；round-04：按用户反馈校准狗尺寸、灌木、船、石头穿插；round-05：完整场景与竖屏/近景/黄昏。
- [初次完整显示](../scene-lab/evidence/round-03/scene-motion-fixed.jpg) → [场景完成](../scene-lab/evidence/round-05/hero-sun.png) → [最新压缩版](../scene-lab/evidence/textures-v0.5/scene-after.png)。早期部分材质未齐，这些不是严格同条件的渲染算法 A/B。
- 四块地形都是同一 v0.2 母件；场景 2×2 不意味着生成一个 2×2 连体模型。
- 海水倒影卡顿来自固定 65 ms 更新。修复后转动样本 719 帧倒影更新 719 次，过期帧 0；修复前 721 帧仅更新 177 次，544 帧过期。
- 646×611、DPR 1.25 受控最后样本约 60 FPS，原/精简 P95 18.3/18.2 ms。中间出现 39.9、55.5 FPS 样本仍保留；未证明慢样本单一原因，不用最终好样本掩盖波动。

## 费用与数据

本轮八类生成实际 380 积分；减面/压缩在本地离线完成，无新增 Tripo 费用。原始纹理 113,931,756 bytes（约 108.65 MiB，详见资产索引）；展示/减面/压缩版各有独立哈希。新任务重新查价和预算，不引用本例当现价。

完整证据索引：[历史视觉报告](../scene-lab/docs/VISUAL-REVIEW-v0.3.md)、[减面/反射报告](../scene-lab/docs/OPTIMIZATION-v0.4.md)、[压缩报告](../scene-lab/docs/TEXTURE-COMPRESSION-v0.5.md)。所有模型和图像均已随本归档保存，不需要作者原电脑。
