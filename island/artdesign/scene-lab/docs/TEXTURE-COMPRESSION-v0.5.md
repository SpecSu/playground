> 历史阶段资料：保留当时的设计与结果，不代表当前状态。当前入口见 [流程框架 0.1](../../README.md)。

# 贴图压缩交付 0.5

2026-10-23。预览默认选择 compact.glb，原始文件、display.glb 与 runtime.glb 均保留。用户要求直接交付，已停止额外验收。

## 结果

8 类模型合计 12,216,880 → 10,171,808 bytes，即 12.22 → 10.17 MB，减少 16.7%。相对减面前 14.73 MB 共减少 30.9%。尺寸不包括页面和 Three.js 代码。

| 内容 | 原体积 MB | 新体积 MB | 减少 |
|---|---:|---:|---:|
| 16 张 PNG 数据贴图 | 4.535 | 3.301 | 27.2% |
| 8 张 JPEG 颜色贴图 | 3.642 | 2.830 | 22.3% |
| GLB 整体（含几何） | 12.217 | 10.172 | 16.7% |

| 资产 | 优化前 MB | 优化后 MB |
|---|---:|---:|
| 小船 | 1.104 | 0.997 |
| 码头 | 1.641 | 1.492 |
| 狗狗 | 2.881 | 2.227 |
| 鱼 | 0.267 | 0.213 |
| 方形地块 | 1.102 | 0.956 |
| 岩石 | 1.309 | 1.167 |
| 花灌木 | 1.550 | 1.397 |
| 松树 | 2.363 | 1.722 |

## 采用方式

- PNG：测试 Oxipng level 4，合计 4.232 MB；最终使用更小的无损 WebP（3.301 MB），16 张解码 RGBA 像素完全一致。
- JPEG：测试 MozJPEG quality 90/93、4:4:4，以及 WebP quality 95。按每张实际结果选择：码头/船用 MozJPEG 93，地块/灌木用 MozJPEG 90，狗狗/松树/岩石/鱼用 WebP 95。
- 颜色贴图属于有损再编码。准入阈值为 RGB PSNR ≥ 42 dB、平均绝对误差 ≤ 1.5/255；实际选中 PSNR 42.54–47.12 dB。数字指标不能代替所有视角的视觉验收。
- 几何缓冲、UV、节点变换、PBR 参数与贴图分辨率保持不变。本轮降低下载和磁盘体积；不是 GPU 压缩纹理，不能宣称降低显存或提升帧率。
- 使用 EXT_texture_webp；浏览器启动时探测 WebP 解码能力，失败则加载原 JPEG/PNG runtime.glb。资产输入哈希变化时旧 compact 派生文件自动失效。

## 已完成证据与范围

8 类 GLB 哈希、几何、材质、变换和数据图像素检查通过；11 项流水线测试、资产检查、格式探测成功/失败路径测试与语法检查通过。实际浏览器已确认加载压缩文件；保存全景、狗狗、松树、码头前后截图。已查看狗狗和松树对照，未见明显新增色偏或细节损坏。依用户最新指令，停止其余画面核对与扩展性能测试，没有补做手机实测。

- [全景压缩前](../evidence/textures-v0.5/scene-before.png) / [压缩后](../evidence/textures-v0.5/scene-after.png)
- [狗狗压缩前](../evidence/textures-v0.5/dog-before.png) / [压缩后](../evidence/textures-v0.5/dog-after.png)
- [松树压缩前](../evidence/textures-v0.5/tree-before.png) / [压缩后](../evidence/textures-v0.5/tree-after.png)
- [码头压缩前](../evidence/textures-v0.5/dock-before.png) / [压缩后](../evidence/textures-v0.5/dock-after.png)

## 工具与复现

工具均在本地运行，没有上传模型、调用 TinyPNG 服务或消耗 Tripo 积分。

- [Oxipng](https://github.com/oxipng/oxipng)：无损 PNG 对比候选；Python 包 pyoxipng 9.1.1。
- [Mozilla MozJPEG](https://github.com/mozilla/mozjpeg)：通过 Sharp 0.35.5 调用。
- [Google libwebp](https://developers.google.com/speed/webp/docs/cwebp)：Pillow 12.3.0 调用，WebP 编码支持来自 libwebp。
- [glTF WebP 扩展](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_texture_webp/README.md)。

使用 Python 3.12 环境安装 `tools/texture-requirements.txt`，安装 `tools/mesh-tools` 的固定 npm 依赖，然后运行 `tools/compress_glb_textures.py`、`tools/verify_texture_compression.py` 和 `tools/tripo_pipeline.py catalog`。完整逐图结果保存在 `scene-lab/assets/texture-compression-report.json`。
