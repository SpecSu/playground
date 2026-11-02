# Playground

互动空间、游戏原型与美术流程的项目仓库。所有项目统一放在 [`projects/`](projects/)，每个项目保留自己的源码、素材、依赖和运行方式。

## 项目导航

| 项目 | 目录 | 内容与入口 |
| --- | --- | --- |
| 分身舞者 · ENCORE | [`projects/avatar-dancer/`](projects/avatar-dancer/) | 3D 换装节奏游戏；先读 [v14 交接说明](projects/avatar-dancer/HANDOFF.md)，大素材需按说明从随库分片恢复 |
| 机甲格斗 · Fight Bot Club | [`projects/fight-bot-club/`](projects/fight-bot-club/) | 机甲对战原型；[项目说明](projects/fight-bot-club/README.md) |
| 灵感花园 · Inspiration Garden | [`projects/inspiration-garden/`](projects/inspiration-garden/) | 等距种植与建造原型；[交接说明](projects/inspiration-garden/HANDOFF.md)、[运行说明](projects/inspiration-garden/README.md) |
| 小岛 · Island | [`projects/island/`](projects/island/) | [即梦庄园玩法工程](projects/island/dreamina-manor-v0.1/README.md)与[美术资产流程](projects/island/artdesign/README.md) |
| 云蹦迪 · AFTERHOURS | [`projects/disco/`](projects/disco/) | 旧版玩法归档，包版本 0.5.3 / Sites 8；[运行说明](projects/disco/README.md) |
| 云钓鱼 | [`projects/fishing/`](projects/fishing/) | 旧版玩法归档，包版本 0.3.5 / Sites 7；[运行说明](projects/fishing/README.md) |
| 火人节 | [`projects/festival/`](projects/festival/) | 旧版玩法归档，包版本 0.3.3 / Sites 35；[运行说明](projects/festival/README.md) |

版本号与状态以各项目交接文档为准。不同项目的版本号不互相比较；本仓库保存源码与交接快照，不会自动更新线上站点。

## 目录结构

```text
playground/
├── projects/                    # 按项目归档，源码和素材留在所属项目
│   ├── avatar-dancer/
│   ├── fight-bot-club/
│   ├── inspiration-garden/
│   ├── island/
│   │   ├── dreamina-manor-v0.1/   # 庄园玩法工程
│   │   └── artdesign/            # 独立美术流程、模型与验收证据
│   ├── disco/
│   ├── fishing/
│   └── festival/
├── docs/
│   ├── repository-layout.md     # 目录约定与旧路径迁移表
│   └── legacy-demos/            # 三个旧版 Demo 的共同说明与历史验证报告
├── manifests/
│   └── legacy-demos/            # 三个旧版 Demo 的版本、素材、依赖与校验清单
├── scripts/                     # 仓库级打包和素材核验工具
├── README.md
└── THIRD_PARTY_NOTICES.md        # 三个旧版 Demo 的来源与授权说明
```

## 从哪里开始

先进入目标项目，再按其 README 或 HANDOFF 安装和运行。仓库没有统一的 npm 工作区，不在根目录执行 `npm install`；各项目的依赖、数据库和存档分别管理。

例如启动灵感花园（无需安装 npm 依赖）：

```sh
cd projects/inspiration-garden
npm run check
npm run build
python3 -m http.server 4173 --directory dist
```

其他项目使用各自说明中的命令。分身舞者的素材恢复脚本、小岛的服务端/数据库配置、旧版 Demo 的本地迁移流程都应按对应交接文件执行。

## 共用资料与工具

- [旧版三个 Demo 的完整交接入口](docs/legacy-demos/README.md)：开发指引、体验原则、素材来源、归档差异与历史验证。
- [清单说明](manifests/README.md)：区分历史记录与当前文件校验和。
- [目录约定和迁移表](docs/repository-layout.md)：以后新增项目、文档与产物放在哪里。
- [依赖与素材授权](THIRD_PARTY_NOTICES.md)：此说明针对旧版三个 Demo；其他项目的来源与限制见各自交接文档，本仓库未设统一开源许可。

在仓库根运行：

```sh
python3 scripts/verify-assets.py  # 只核验旧版 disco / fishing / festival 的素材清单
python3 scripts/package.py        # 全仓源码包 + 三个独立旧版 Demo 源码包
```

输出位于 Git 忽略的 `artifacts/`。源码包按脚本规则排除构建产物和本地依赖，不等同于可直接部署的站点发布包。
