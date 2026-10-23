# 即梦庄园 0.1 交接

## 1. 先确认基线与边界

- 对外归档版本：0.1；package：0.1.0；内部发布版本：Sites v7。
- 发布源码 SHA：`0bb9ab401b82ff88fbb4b2804d3a8c4dbeb00767`，不是此前 Sites v6。
- 当前线上：[即梦庄园](https://dreamina-manor.mythicgleam32.chatgpt.site/)。本归档不部署、不清档、不变更玩法。
- 原 Sites 项目：`appgprj_6ada46e99b6c81919a0b4e8db57f4163`；v7 保存版本：`appgver_5692d932bbd881919df8190bf6642bd7`。这些是来源标识，不是访问凭据。
- 归档来源为该提交的完整 Git 跟踪文件；只改 README 和 `.openai/hosting.json`，并加入本文、部署模板、来源说明与校验文件。运行代码、正式测试、package-lock 和素材均未改变。`ARCHIVE-MANIFEST.json` 逐项记录原 SHA-256、归档 SHA-256 和差异。
- 不含 `.git`、node_modules、dist、缓存、QA 私档、数据库、日志、真实用户存档、环境变量/密钥或私人协作资料。原工程未删除。所有人物素材已内置，不依赖三个旧 Library 分包。

## 2. 本地安装、检查与运行

要求 Node.js >=22.13.0；本次归档验证环境为 Node 24.19.0 / npm 11.9.0。进入本目录后：

```sh
npm ci
node scripts/verify-archive.mjs
npm test
npx tsc --noEmit
npm run build
npm run dev -- --port 5174
```

开发地址：`http://localhost:5174/?uid=qa-local-01`。只用新的 `qa-*` 庄园号测试，勿用真实玩家号。开发模式在首次游戏 API 请求时创建本地表；正式 `start` 不自动建表。首次生产模式预览用以下命令显式初始化本地 D1：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_lumpy_slipstream.sql
npm run start -- --port 5174
```

迁移命令只用于新本地库，已初始化的库不要重复执行同一建表 SQL。本地状态存于 `.wrangler/state`，不要提交或上传。`npm ci` 使用保留的锁文件；无须全局安装 Three.js/Blender，运行游戏不需要 Blender。重建美术才需要 `art-source/README.md` 中的可选工具。

受限云容器若启动时报无法创建 `~/.config/.wrangler`，使用可写的工程内配置目录，不需要生产凭据：`mkdir -p .sites-runtime/config`，然后 `XDG_CONFIG_HOME="$PWD/.sites-runtime/config" npm run start -- --port 5174`。这是归档验证时使用的环境适配，不是游戏代码改动。

## 3. 文件与系统地图

- `app/`、`components/manor/Manor.tsx`：Next 风格 React 页面、交互协调、状态与 Three.js 生命周期。实际构建链为 Vinext + Vite + Cloudflare Worker，不是仅靠静态托管的应用。
- `app/api/game/route.ts`、`worker/index.ts`：API 与 Worker 入口。前端与 API 必须同源；跨源 POST 会拒绝。
- `lib/game/`：10 种植物、20 种鱼、五档经济、纯状态与本地操作 reducer；`lib/server/`：服务端校验、存储、社交和 batch 处理。
- `lib/client/local-journal.js`、`action-queue.js`、`snapshot-order.js`、`monotonic-clock.js`：持久命令日志、旧请求恢复、快照排序、单调时间。
- `lib/world/`：场景、移动、手势、游泳、建造预览；`lib/art/`：程序化鱼/码头/鱼缸、植物展示和比例；`lib/avatars/`：人物加载、骨骼与动作。
- `public/assets/avatars/`：12 个原 GLB + 12 个 WebP 及原校验清单；`public/assets/world/`：10 株植物 GLB/元数据、地块、10 个种子/鱼饵 SVG 图标。人物的原始建模工程不在来源工程中，不能声称可从脚本重建全部人物。
- `lib/client/ocean-audio.js`：Web Audio 合成海浪，无缺失的外部 mp3；需要用户有效手势启动。鱼也由代码生成，不是遗漏的 20 个 GLB。
- `art-source/`：11 个 Blender 源文件、生成与验证脚本。它们用于交接，不进入公开网页静态资源。
- 美术旧文档勘误：`art-source/README.md` 中鱼的 `.01 unit/cm` 是旧描述，未为归档改写历史文件；实际展示比例以 `lib/art/physical-contract.js` 的平方根公式和本目录 README 为准，不要按旧句把展示强行还原为现实厘米等比。
- `db/`、`drizzle/`：D1 schema 与迁移；`tests/`：正式 Node 测试；`scripts/`、`vite.config.ts`、`.openai/`：完整构建/环境/部署材料。

## 4. 玩法与不可破坏的同步约束

1. 每颗种子/每份鱼饵只使用一次，产出一件；10 种植物、20 种鱼、五档，金色与巨型互斥。不要改成无限生产。价格、概率与等待见 README 和 `lib/game/catalogue.js` / `economy.js`。
2. 自身买种、种植、生长、收获、拿放、出售、建造先通过共享纯 reducer 在本地投影，再把持久 journal 分批提交云端。跨用户赠送/取走仍需云端确认。不得退回“每步等 ACK”，也不能直接盲覆盖整份存档。
3. `lib/server/local-batch.js` 校验稳定命令 ID/序号、资源与依赖，再用 store 的 CAS 与 receipt 原子提交。只确认已接受的前缀，剩余命令继续重放；重试沿用原 ID 和原 body，不另扣一次钱。多标签页/旧 ACK 不能覆盖较新的 GET。
4. 随机结果由预发序列及稳定序号固定；同一产出重放/刷新不能重抽品种、金色/巨型或物品 ID。job 的 `startedAt` 固定，以单调 clock 表现生长，不能用 ACK 到达时间重新起算或让百分比倒退。
5. v6 pending 请求须先以原 opId/body 恢复，再与 v7 journal 共存；未知结果时不要清 localStorage、换请求编号或强行清队列。另一个标签页未确认时，回原标签页恢复连接。
6. 聊天带原始 `islandUid`；服务端及原子提交都核验 origin 岛。导航确认前不发送，离岛/过时消息丢弃但不永久阻塞队列。HTTP Origin 校验与 island 校验是两层不同保护，都保留。
7. 聊天只显示头顶气泡，自己立即出现，迟到回执不重复弹；输入时收起其他面板。空地交互保留地面小气泡引导，不自动展开空种子托盘。
8. `uid` 只是轻量庄园号，不是安全登录，知道它的人能使用同一存档。当前协议不是强反作弊方案；不要声称账号隔离、身份认证或经济安全已达到正式商业产品标准。

## 5. 部署与迁移

归档默认 `.openai/hosting.json` 为 `{"d1":"DB","r2":null,"project_id":null}`；另部署先在自己的授权环境配置项目，参照 `hosting.example.json`。不要复制生产数据库、凭据或本地存档。只有前端静态文件无法提供云存档/多人功能。

`npm run build` 后必须保留完整 `dist/`，尤其 `dist/.openai/hosting.json`、`dist/.openai/drizzle/`（SQL、meta/_journal.json）和 `dist/server/`。不能只打包 `dist/client`，也不能漏掉点目录。配置真实授权的 Sites 项目身份后，可检查待上传包：

```sh
tar -czf /tmp/manor-site.tar.gz dist
node scripts/check-release-archive.mjs /tmp/manor-site.tar.gz
```

默认占位 project_id 下该发布检查会有意拒绝，不表示本地构建失败。不要为使检查通过而填入原站身份后随意发布。迁移由目标部署环境在独立 DB 执行；普通第三方 Cloudflare 部署还须自行配置账户、Worker、D1 binding/数据库 ID、迁移和域名，本归档不包含这些账户凭据。

若后续获授权维护原 public 站，必须继续用原 Sites 项目及同一生产 DB；不得重建 project、改变 audience、替换成旧小岛或用空库“恢复”。回滚程序与回滚/丢弃数据库是两回事。先在新 `qa-*` 身份验证，再发布；不要测试真实玩家存档。

## 6. 已验证事实与限制

- 发布冻结时 156 tests、TypeScript noEmit、production build 通过。全仓 lint 非绿，存在既有债务，不得写成所有检查通过。
- 独立外置核心 20 项先前通过，四核心模块与最终冻结字节相同；最终联合脚本复跑在跨例等待/清理处挂起被终止。不是最终 20/20 或 21/21 联合全绿。独立最终聊天跨岛回归通过。
- 云 Chromium 实屏已做固定 4 秒 ACK 与另一次 15 秒挂起/超时实验，买种→种→长→收→拿可连续完成；释放后原请求恢复/合批，刷新后的钱、种子、job、手持物与随机序号守恒。浏览器模拟移动尺寸，不是真机；不把 DOM 时间等同于像素时延，也不宣称全动作全 UI 验收。
- 建造/放回/出售/钓鱼/跨用户在本轮并非全部实屏覆盖。云 API 当时仍约 3–7 秒，本地响应优化没有根治 D1 延迟或证明平台无故障。
- 归档后的复验范围和实际结果见 `VERIFICATION.md`。无 CI workflow 被本次新增；没有自动部署。

接手时先跑校验和/测试/构建，再读以上同步约束。修改玩法、数值、身份或生产数据前单独确认范围。资产来源与许可边界见 `ASSETS.md`。
