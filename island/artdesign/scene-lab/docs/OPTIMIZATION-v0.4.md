> 历史阶段资料：保留当时的设计与结果，不代表当前状态。当前入口见 [流程框架 0.1](../../README.md)。

# 运行资产优化 0.4

2026-10-23。预览默认加载精简模型，界面不提供原面数切换；原始模型与展示副本继续保留。没有新增付费生成或重新制作贴图。

## 资产体积与几何

八类运行 GLB 合计 **12,216,880 bytes（12.217 MB / 11.651 MiB）**，包含内嵌 PBR 贴图。上一展示版本为 14,727,884 bytes，下载体积减少 **17.0%**。这些数字不包括 Three.js 与页面脚本，也不等同于运行内存或显存。

| 资产 | 原三角面 | 精简三角面 | 当前文件体积 |
|---|---:|---:|---:|
| 狗狗 | 47,648 | 21,440 | 2.881 MB |
| 松树 | 63,926 | 22,374 | 2.363 MB |
| 方形地块 | 25,606 | 21,842 | 1.102 MB |
| 花灌木 | 34,358 | 29,046 | 1.550 MB |
| 码头 | 31,415 | 21,517 | 1.641 MB |
| 小船 | 26,936 | 14,386 | 1.104 MB |
| 岸石 | 17,918 | 9,964 | 1.309 MB |
| 鱼 | 5,724 | 3,002 | 0.267 MB |

独立资产总三角面 253,531 → 143,571（减少 43.4%），几何缓冲区 6,534,914 → 4,023,922 bytes（减少 38.4%）。重复地块、石头和鱼共享加载的模型资源。

离线使用 meshoptimizer 的属性感知简化，保留边界、UV 接缝与极值顶点。检查确认内嵌图像、PBR 参数、节点变换不变，保留的顶点属性来自原模型。地块与灌木受误差约束，实际简化幅度较小。完整数据与哈希见 [optimization-report.json](../assets/optimization-report.json)。

## 倒影不连贯的原因与修复

原代码每隔 65 ms 才更新倒影，转动相机时主画面与倒影更新频率不一致。改为相机移动、缩放或投影变化时逐帧更新；静止时约 30 Hz 更新动画倒影。调整灯光和尺寸也使倒影失效并更新。保持原离屏分辨率，没有增加后处理。

真实浏览器 404 × 527、DPR 1.25 的 12 秒转动样本：修复前 721 帧中倒影更新 177 次，544 个移动帧使用旧倒影；精简版修复后 719 帧更新 719 次，旧倒影帧为 0。倒影更新间隔 P95 从 79.5 ms 降至 20.5 ms。

646 × 611、DPR 1.25 的最后受控对照：原模型与精简模型均约 60 FPS，帧间隔 P95 分别 18.3 / 18.2 ms，倒影均逐帧更新，已分配纹理均为 32。多次离屏渲染计入后，每帧最大三角面 1,290,562 → 841,578，绘制调用数均为 41。

测试中也出现 39.9 FPS 的切换样本和 55.5 FPS 的重新加载样本，均保留在证据目录中；原因没有被单独证明，不能以最终 60 FPS 推断所有运行条件稳定。当前证据支持几何与文件负担下降、倒影更新时间同步，不支持宣称普遍 FPS 提升。没有真实手机 GPU 测试；纹理未做 KTX2 压缩，本轮没有降低纹理显存。

## 图像与测量证据

目录：`scene-lab/evidence/optimization-v0.4/`。

- 同机位、同时间全景：[原版](../evidence/optimization-v0.4/scene-original.png) / [精简版](../evidence/optimization-v0.4/scene-runtime.png)
- 狗狗近景：[原版](../evidence/optimization-v0.4/dog-original.png) / [精简版](../evidence/optimization-v0.4/dog-runtime.png)
- 植物近景：[原版](../evidence/optimization-v0.4/plants-original.png) / [精简版](../evidence/optimization-v0.4/plants-runtime.png)
- 测量：before-orbit.json、reflection-fix-original-mesh.json、optimized-orbit.json、large-original-orbit.json、large-optimized-orbit.json、large-optimized-fresh.json、final-original-orbit.json、final-runtime-orbit.json。

截图检查未见新增的明显轮廓断裂、五官变形或 UV 错乱；既有树叶粘连、灌木针孔仍存在。自动检查通过：10 项流水线检查、倒影调度回归、资产装配与共享资源释放、8 类真实 GLB 属性与纹理一致性、JavaScript 语法。

## 复现与技术来源

离线工具：`tools/mesh-tools/`。依赖由 lockfile 固定，运行 `npm ci --ignore-scripts`、`npm run build`、`npm test`。默认输入是 display.glb，输出 runtime.glb，原文件不会覆盖。更新资产目录后运行流水线 catalog 命令接入。

- [meshoptimizer 官方 Simplifier 说明](https://github.com/zeux/meshoptimizer/blob/master/js/README.md#simplifier)
- [glTF Transform 官方 simplify 说明](https://gltf-transform.dev/modules/functions/functions/simplify)
