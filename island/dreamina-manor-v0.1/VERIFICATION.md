# 0.1 原目录覆盖更新记录

更新日期：2026-10-23。当前来源：Sites v11，`085d34080ba13c0719e0e2396846a4a85f2682dc`。外部目录/版本仍为 0.1。

## 本轮范围

按用户要求直接同步已发布版本，不重新运行 npm ci、软件测试、typecheck、构建或浏览器。只生成新来源的文件 manifest、复用/上传变化 Git blob，并在提交后读取远端核对文件和 commit。此前通过的结果不冒充本轮新测试。

## 已有来源证据

- Sites v10 / `f318c7b8943c86e83a5a3752a71e310c972645b2`：193 正式测试、tsc、build；独立同源 28/28 逻辑集成检查通过。v11 在此基础上仅把背包初始收起并增加 initial-panel 正式回归测试。
- v10 本地云 Chromium 402×874 已记录真实土地 12 秒施工、刷新续时、hold-ACK 连种两株、鱼获自动换手、码头热区、缓存与半屏图标展示。独立施工/连续种植模块测试使用虚拟钟/事件仿真，不替代实屏。没有真机验证；公网云浏览器的 3D 渲染限制仍保留。
- v10 生产关系迁移已核实两条 twx↔subeike 好友边，未用两真实 UID 进行玩法读写测试。本归档只携带幂等关系迁移，不携带生产数据。
- 既有 lint 债务和 D1 秒级延迟边界仍在，不声明所有检查全绿或平台问题已根治。

以下保留首次归档的历史证据，仅适用于当时 v7 源码。

---

# 初始 v7 归档复验（历史记录）

日期：2026-10-23。冻结来源：`0bb9ab401b82ff88fbb4b2804d3a8c4dbeb00767`（Sites v7）。本次仅归档，不重新发布线上站点。

## 本次实际执行

- 在独立归档目录以 Node 24.19.0 / npm 11.9.0 执行 `npm ci --offline`，使用已有 npm 缓存安装锁文件中的 696 个包成功。未借用原工程的 node_modules；未修改 lockfile。
- `npm test`：156 tests，156 pass，0 fail / cancelled / skipped。
- `npx tsc --noEmit`：退出 0。
- `npm run build`：退出 0。保留 chunk 大于 500 kB、Vinext 动态路由静态分类有限的警告，不把它们隐瞒为零警告。
- 核实 `dist/server/index.js`、`dist/client`、`dist/.openai/drizzle` 的 SQL 和 journal 齐全，归档的 project_id 仍为 null。构建输出不提交到本目录。
- 按 HANDOFF 的 `wrangler d1 execute DB --local` 在全新本地库执行 6 条迁移语句成功，不访问生产 DB。
- `npm run start` 在受限容器需指定工程内 XDG_CONFIG_HOME，随后 Wrangler 报 Ready。适配命令已写入 HANDOFF；没有改动游戏/框架运行源码。
- `npm run lint`：退出 1，86 errors / 46 warnings。82 errors 来自原 Manor.tsx，其余 4 来自原 API/CollectionBook/ItemThumb；新增 verify-archive.mjs 为 0 errors / 0 warnings。错误均在未改动的基线文件内，本次不做产品重构。
- 独立只读审查确认来源 298 个跟踪文件全部保留，只有 README 与生产绑定配置改动；24 个人物二进制均符合原 manifest，21 个 art manifest 文件匹配；GLB 没有外部 buffer/image 依赖，静态资源与音效引用无漏项。
- 常见凭据模式扫描无命中；最终提交清单只由来源文件及明确新增的交接文件生成，不扫描打包 node_modules、dist、.wrangler 等运行目录。所有文件逐一记录 SHA-256，单文件均低于 GitHub 100 MiB 限制。

## 不扩大结论

本轮没有重新做完整实屏、真机、多端或平台性能验收。发布前的实屏/慢网证据与独立联合脚本限制保留在 HANDOFF 第 6 节，不声称最终外置联合测试全部通过。云 API 仍可能有秒级延迟。生产 uid 不是安全账号，归档不提供强反作弊承诺。

仓库没有为这个目录配置自动 CI/部署；本次不新增自动部署或更改现有站点。后续修改后应重新运行校验、测试和构建，不能沿用本报告作为新代码通过的证据。
