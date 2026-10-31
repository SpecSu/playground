# 绒绒世界 V39 源码归档

本目录保存 2026-10-31 核对的绒绒世界 Sites v39 源码与游戏静态资源。

- 原源码提交：`29778441c3661f6015844b87ecd430b4d7486b90`。
- 体验入口：https://fluffy-farm-companions.tangguozhou.chatgpt.site/
- 项目功能与植物花园对照：仓库 `docs/GAME_PROJECTS_STATUS_2026-10-31.md`。
- 旧 `demos/farm` 保留作历史工程，本目录是包含当前 Sites/Worker 适配的独立工程，不要求覆盖旧目录。
- 原根 README 含 V25 历史说明。当前支持范围请以项目现状文档、对应源码与本文件为准，不要把 README 的旧版狼机制当作默认开启。

## 归档范围

保留 890 个原源码和资源文件，122,079,379 bytes。`ARCHIVE_MANIFEST.json` 记录原 Git blob SHA 与 SHA-256，便于逐文件核对。

排除原仓库中的本机 `node_modules` 绝对软链接和旧 `docs/evidence/sites-v27/local-validation.log`。不包含生产数据库、玩家存档、cookie、环境变量秘密、Git 历史、构建产物或本次检查日志。

`.openai/hosting.json` 保留原站项目标识以记录来源；它不是新项目部署模板，克隆后不要直接向原站发布或覆盖其数据库。仓库归档本身不变更线上站点或已有存档。

## 开发验证

要求 Node.js >=24.9.0，在本目录执行：

```sh
npm run install:ci
npm run typecheck
npm run lint
npm test
npm run build
npm start -- --port 5191
```

5191 为隔离的本地 Worker 预览。登录、D1 和部署开关仍须相应运行环境支持。独立 Node/SQLite 本机演示另见 `local/README.md`，不要覆盖现有 5190 服务或已有数据库。

本次归档前验证：1119 项测试中 1117 通过、0 失败、2 跳过；TypeScript、ESLint、构建通过。两个跳过项未验收，`npm test` 不代表已运行全部独立 DOM 脚本。构建有大 chunk 警告。未完成浏览器视觉、音质、手机 GPU 或真人双账号端到端验收。
