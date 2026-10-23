---
name: artdesign
description: 按小岛美术资产流程制作和交接风格统一的单体参考图、Tripo 3D/PBR 资产及 Three.js 场景，支持减面、贴图压缩和证据验收。
---

# 小岛美术资产搭建流程 0.1

先读 [接手说明](docs/HANDOFF.md)，辨别任务是查看示例、制作新资产、组装场景、离线优化还是验收。已有样例可直接启动，不默认重新付费生成。用户本次范围和既有授权优先。

按阶段读取：

- 设计或生成图片：读 [参考与资产确认](docs/01-reference-assets.md)，使用可用的图像生成工具；保留提示词与图像版本。主图与三维证据分开。
- 图转 3D / PBR：读 [Tripo 执行](docs/02-tripo-generation.md)，先样板、灰模、再纹理；记录 task_id 与输入哈希。CLI 不支持的参数不盲重试。
- 装配 / 渲染：读 [Three.js](docs/03-assembly-rendering.md)，保持角色部件相对变换、接点与材质通道，真实浏览器看图。
- 性能 / 下载优化：读 [优化](docs/04-optimization.md)，保留原件，分别控制几何误差和贴图误差；对照 [真实案例](examples/eight-asset-island.md)。
- 验收 / 交付：读 [验收](docs/05-acceptance.md)，使用 [记录模板](templates/ASSET_REVIEW.md)，明确证据、假设与未测项。

本流程不把精致造型交给光照补救。两轮有明确目标的模型修订仍不过关时，提出模型师清理/成熟同风格模型等具体替代方案。不要无目标重抽或将不同风格直接混搭。

工具默认从本 skill 根目录运行。新类别需要调整 SPECS、资产检查配置与 layout，并不自动具备八类样例之外的语义支持。密钥、任务 token、完整服务端响应只留在工作目录，不进入交付包。
