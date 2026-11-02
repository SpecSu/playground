# 仓库目录约定

## 按项目找文件

每个独立项目位于 `projects/<project-name>/`。源码、运行素材、项目说明、测试、制作脚本和历史证据跟随所属项目，不拆散到全仓共用的 `src/`、`assets/` 或 `tests/` 中。

小岛的玩法与美术流程属于同一项目，分别保留在 `projects/island/dreamina-manor-v0.1/` 和 `projects/island/artdesign/`。分身舞者与云蹦迪是独立项目，不能因都涉及跳舞就合并素材或版本。

- 根 README：所有项目的导航。
- `docs/`：仓库级说明，以及明确标注适用范围的跨项目资料。
- `docs/legacy-demos/`：仅 disco、fishing、festival 共用的开发与归档说明。
- `manifests/legacy-demos/`：这三个旧版 Demo 的清单与记录。其他项目的清单继续放在各项目内部。
- `scripts/`：仓库级工具。项目自己的脚本继续放在项目目录里。
- `artifacts/`：本地打包输出，不提交 Git。

新增项目使用稳定、简短的小写连字符目录名；日期和版本写入项目说明、CHANGELOG 或明确的快照子目录。已有项目的内部版本目录、素材名、导入路径和历史证据不强制改名。

## 2026-11-02 迁移表

以下路径均相对于仓库根目录。

| 原路径 | 当前路径 |
| --- | --- |
| `avatar_dancer/` | `projects/avatar-dancer/` |
| `fight-bot-club/` | `projects/fight-bot-club/` |
| `inspiration-garden-2026-10-27/` | `projects/inspiration-garden/` |
| `island/` | `projects/island/` |
| `demos/disco/` | `projects/disco/` |
| `demos/fishing/` | `projects/fishing/` |
| `demos/festival/` | `projects/festival/` |
| 原 `docs/` 中的六份文档 | `docs/legacy-demos/` |
| 原 `manifests/` 中的十份清单 | `manifests/legacy-demos/` |

根 README 改为全项目导航；旧版 Demo 的完整说明保留在 [legacy-demos/README.md](legacy-demos/README.md)。[小岛入口](../projects/island/README.md)同时列出玩法与美术工程。

此次调整保留所有原有受 Git 跟踪的文件、素材分片、已归档构建产物与项目内结构。只更新受目录变化影响的说明、路径与校验信息，不改变游戏功能、依赖版本或线上部署。

从仓库根启动的旧命令须按上表更新。历史证据中的原作者机器路径、原始导出目录与发布 URL 保留其来源含义，不能据此假设这些路径在新检出中存在。外部使用者保存的旧 GitHub 文件链接也需按此表更新。
