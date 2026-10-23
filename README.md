# playground

project and demo for interactive spaces and games

## 小岛美术资产流程

[小岛美术资产搭建流程 0.1](island/artdesign/README.md)：图片与资产确认、Tripo 几何/PBR、Three.js 装配渲染、减面、贴图压缩和证据验收。包含可供其他 agent 使用的 skill、分阶段手册、八类资产的五阶段 GLB、真实截图与可离线运行的示例。

从 [接手说明](island/artdesign/docs/HANDOFF.md) 开始。此目录为独立美术实验，不改动下列旧版玩法 Demo。

## 三个旧版玩法 Demo 归档

本节归档用户指定的三个已发布版本，包含可编辑 TypeScript/React/Three.js 源码、服务端 API、D1 数据结构与迁移、运行素材、资产处理脚本及既有测试。不是静态 dist 备份。这三个 Demo 包不包含小岛或潮汐来信 v0.2；小岛美术资料见上方独立入口。

| 工程 | 包版本 | Sites 发布版 | 线上地址 | 发布源码 commit |
| --- | --- | --- | --- | --- |
| [云蹦迪](demos/disco/README.md) | 0.5.3 | 8 | [打开](https://dreamina-disco-avatars.mythicgleam32.chatgpt.site/) | `b957db28ad5650daafdfd31dc4aa333d58a98d6a` |
| [云钓鱼](demos/fishing/README.md) | 0.3.5 | 7 | [打开](https://dreamina-fishing-avatars.mythicgleam32.chatgpt.site/) | `55de7c92b90d54665d4f4772b793aa5be46e856b` |
| [火人节](demos/festival/README.md) | 0.3.3 | 35 | [打开](https://dreamina-desert-festival.mythicgleam32.chatgpt.site/) | `1237c6810f851b33f50652c379268a5d5d3dc33d` |

基线由 Sites 保存版本的源码 commit、成功发布记录和恢复后的 Git HEAD 交叉核对，未按文件修改日期挑选。机器可读映射在 [versions.json](manifests/versions.json)。归档剔除了旧个人主页图片和固定示例个人姓名，替换为中性占位图；移除了生产站点身份，保留本地 D1 绑定。完整差异见 [归档差异](docs/archive-differences.md)。因此本包是精确发布基线经过明确脱敏后的源码副本，不声称与线上逐字节一致。

## 从零运行

需要 Node.js 24.9.0（各工程 `.nvmrc`）与 npm 11.6.0；源码声明最低 Node 22.13.0，本轮使用固定版本验证。每个工程有独立 `package.json`、`package-lock.json`、`public/` 和服务端代码。不要合并三个工程的数据库或运行状态。

```sh
cd demos/disco # 或 fishing / festival
npm run install:ci
npm run typecheck
npm run build
npm run db:init
npm run start -- --port 5181
```

开发模式：`npm run dev -- --port 5181`。本地使用 Wrangler/Miniflare 的 D1 模拟器；`npm start` 在 `.wrangler/state` 保存本地状态。这些文件不应上传。必须先执行 `npm run db:init` 应用归档中的 SQL 迁移；首次 API 请求随后初始化房间记录。此脚本强制 `--local`，不会迁移线上数据库。在线多人需要同一个服务器地址与共享 D1，打开多个各自独立的本地服务不构成联机。

完整现有测试可用 `node --experimental-strip-types --test --test-concurrency=1 tests/*.test.*`；这是包含高成本模型网格检查的历史套件，不等同于构建前必须全部通过的快速检查。实际结果和遗留失败见 [验证报告](docs/verification.md)，不得据此假定 UI、性能或所有历史测试均通过。

## 开发与交接

- [开发指引](docs/development-guide.md)：阶段、技术职责、边界、资产、同步、性能、发布。
- [体验设计原则](docs/experience-principles.md)：用户明确要求、历史实现和新建议分列。
- [交接与验收](docs/handoff-checklist.md)：接手顺序及完成标准。
- [素材与缺失项](docs/assets-and-provenance.md)、[依赖与许可](THIRD_PARTY_NOTICES.md)。
- [素材清单与 SHA-256](manifests/assets.json)、[源文件校验和](manifests/source-files.sha256)、[归档调整](manifests/archive-adjustments.json)。

`scripts/avatars/` 中的旧版程序化角色生成器不能重新生成 `public/avatars/cast-v1/` 的全部上传模型。缺失原始建模工程、用户原始参考图、未处理录音与云端实际数据库，详见素材文档。

## 打包与核验

在仓库根运行 `python3 scripts/verify-assets.py` 检查素材，然后 `python3 scripts/package.py` 生成总源码包与三个独立源码包。ZIP 包及其校验和位于被 Git 忽略的 `artifacts/`，不把重复压缩包提交到 Git。固定文件排序、时间戳及权限；同一 Python/zlib 环境下可重复得到相同 ZIP。

三个工程保留独立素材路径；相同二进制由 Git 内容寻址自动去重，不需要复制共享目录或符号链接才能启动。单文件均低于 100 MiB；本轮未启用 Git LFS、创建付费配置或新增长期凭据。

## 归档边界

上述三个 Demo 仅归档源码与必要素材；不含 Git 历史、环境变量、运行数据库、用户会话、私有参考图、内部文档、聊天或记忆。小岛美术目录另含用户授权交接的参考图，边界见其来源说明。没有修改三个线上站点。许可说明不授予本仓库内容统一的开源许可证；用户提供素材的授权范围不自动扩展到第三方商业使用。
