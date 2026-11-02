# 依赖、素材来源与授权边界

本次用户授权把指定三个 Demo 的代码和必要演示素材归档到指定仓库；这不代表素材全部原创、可任意再分发或可商用。本包没有擅自附加覆盖所有代码和资产的 MIT/Apache 等统一许可。

## 软件依赖

各工程保留原始 `package-lock.json`，固定实际安装的完整依赖树。主要版本包括 React 19.2.6、Three.js 0.186.1、Next 16.3.4、Vinext 1.0.0-beta.5、Vite 8.0.13、Wrangler 4.92.0、TypeScript 5.9.3。`npm run install:ci` 使用 `npm ci`，不会依赖本机全局 node_modules。

第三方依赖遵循各自包内 LICENSE。机器可读的锁文件许可字段清单见 `manifests/legacy-demos/dependencies.json`；未声明许可的项标为 unknown，不自动推断。它不是法律审计。`build/sites-vite-plugin.LICENSE`、`vendor/shadcn-tailwind-4.13.0.LICENSE.md`、图标与字体原始许可文件均保留。

## 演示素材

| 类别 | 可验证的本地证据 | 本次处理 |
| --- | --- | --- |
| 上传分身 `avatars/cast-v1/*.glb`、派生头像 | `cast-v1/manifest.json` 的文件名、大小、SHA-256；源码实际引用 | 保留必要演示副本；模型原始工程、来源许可或通用商业再分发授权未完整提供，标记 unknown/user-supplied，不宣称原创或开源 |
| 旧程序化 GLB | `avatars/manifest.json` 与 `scripts/avatars/` 生成代码 | 保留历史资源和生成器；原文件的原创声明只适用于其声明对象，不能套用到新上传 cast-v1；人物参考图未包含 |
| 云蹦迪五首用户提供 Suno 录音 | `public/audio/CREDITS.txt` 与 `scripts/audio/user-generated-provenance.json` 记录 Demo 使用范围 | 按本次用户的指定工程归档授权保留压缩演示副本；不授予一般再分发许可，也不推断用户订阅方案的商用权利 |
| 跳舞机录音 `gai-chi-yao-le.mp3` | 配套源码、分析脚本和曲目记录 | 原始权利文件不完整，归档标记许可待核实；公开衍生分发或商业发布前应补齐许可或替换 |
| Solace — Scott Buckley | 钓鱼 `public/audio/CREDITS.txt` 记载 CC BY 4.0、官方来源及修改 | 原署名及修改说明随文件保留；[作品来源](https://www.scottbuckley.com.au/library/solace/) |
| Arabic Nights — Nemphirex | `public/audio/CREDITS.txt`、音频脚本许可证据记载 CC BY 3.0 | 保留署名和剪辑/转码说明；这是历史工程记录，不是本轮新增授权；[作品来源](https://soundcloud.com/nemphirex/nemphirex-arabic-nights) |
| 火焰/欢呼音效 | 火人节 `public/audio/festival/CREDITS.txt` 记载 CC0 来源 | 保留来源与处理记录；[火焰来源](https://opengameart.org/content/fire-crackling/)、[欢呼来源](https://freesound.org/people/BeeProductive/sounds/430046/) |
| Lucide 图标、DejaVu 字体 | `public/feed-ui/LICENSE-lucide.txt`、火人节 `public/fonts/DEJAVU-LICENSE.txt` | 保留许可文件 |
| 旧 Feed 个人主页图片 | 来源与公开授权未充分核实，其中含真人照片 | 每工程 9 张全部剔除，统一替换为本次代码绘制的中性 SVG |

本文件的许可分类来自归档中的证据，未对所有上游授权合同进行独立法律核验。公开可下载、能在网页查看、模型由生成工具产出，都不构成权利证明。未知项需要权利人确认；若接手者无法确认，应在进一步分发前替换。可运行演示与可向任何人开放再分发是不同的交付标准。
