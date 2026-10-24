# 即梦庄园 0.1 交接

## 发布与归档基线

- 对外目录/版本保持 0.1（package 0.1.0）；内部 Sites 23，源码 `c02644d3a997f3d40b3f9dfb9125780a4e1e9b1a`，更新日期 2026-10-24。
- 保存版本 `appgver_0fd2bf3a74e88191b07edc16a390113e`；deployment `appgdep_6adc357a24608191974178d5cb2384d9` 于 2026-10-24T04:35:17.487219Z succeeded。原体验地址：https://dreamina-manor.mythicgleam32.chatgpt.site/ 。本次只同步已发布代码，不再部署站点。
- 从精确提交 git archive，不复制运行工作树；不含真实玩家存档、原操作列表、DB/receipts、私有 QA/日志、浏览器资料、凭据或协作笔记。原工程不删除。
- 运行源码、package-lock、tests 和素材不改；README 替换为独立交接入口，`.openai/hosting.json` 的 project_id 置 null；新增部署模板、本文、素材/验证说明、校验脚本与 manifest。逐文件原始/归档 SHA 和必要差异均在 ARCHIVE-MANIFEST.json，不能称所有文件字节与来源相同。

## 本地运行与构建

Node >=22.13；`npm ci` 使用 lockfile。无需单独下载人物包，运行不依赖 Blender。先按 README 安装/校验/测试/typecheck/build；开发 `npm run dev -- --port 5174`，用 `http://localhost:5174/?uid=qa-local-01` 等独立身份。

生产预览先对新本地库应用迁移，再启动；已有库不要重复执行初始建表：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_lumpy_slipstream.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_dizzy_jack_flag.sql
npm run start -- --port 5174
```

0001 是独立好友关系表与 twx↔subeike 关系，不是玩法存档；换环境先确认是否保留这两条演示关系。不要导入生产 DB 或真实用户状态。本地 DB 在 `.wrangler/state`，不提交。受限环境若不能创建默认 Wrangler 配置目录，可 `mkdir -p .sites-runtime/config` 后用 `XDG_CONFIG_HOME="$PWD/.sites-runtime/config" npm run start -- --port 5174`。

Vinext + Vite 构建 Cloudflare Worker；不是纯静态 Next 导出。`npm run build` 还生成缓存头，不跳过该阶段。发布必须完整携带 `dist/` 点目录与 `dist/.openai/drizzle/` 两份 SQL 和 meta journal，只有前端资源不能提供云存档/多人功能：

```sh
tar -czf /tmp/manor-site.tar.gz dist
node scripts/check-release-archive.mjs /tmp/manor-site.tar.gz
```

默认安全占位 project_id 会被发布检查拒绝，本地 build 仍可使用。另部署需自行配置授权项目、Worker、D1 binding/ID、迁移、域名与凭据；此仓库不附生产访问权。维护原站必须继续既有项目和 DB，不改变 audience、不重建、不用空库“恢复”，发布须遵循当时授权。

## 不可破坏的同步与玩法约束

1. 共享纯 reducer 投影自身动作，持久 journal 保存稳定命令 ID/序号；服务端 batch 校验资源、依赖、时间，再经 CAS 与 receipt 原子提交。只确认已接受前缀，未确认部分重放；不能退回每步等 ACK，也不能盲覆盖整份存档。
2. 未知结果保留精确原 ID/body，先查已写回执。旧 v6 pending、跨会话请求与当前 journal 共存，不能为解卡清 localStorage、换 opId 或丢未确认备份。多标签页/迟到 ACK 不得覆盖较新快照。
3. 预发随机序列/序号固定产物、变异与 ID；catalogue v1/v2 兼容旧种植，不用新版20植物表重抽旧批次。job startedAt 固定，单调 clock 展示生长，不能以 ACK 时间重新起算或倒退。
4. 施工仍为 12 秒，连通格验证、施工占位及一次扣费保留；鱼缸按完成格、真实鱼包络和现版深度容纳，旧鱼空间不符须保原 ID/价值，不可暗售或丢失。真实尺寸与显示尺度不可随意混改。
5. 聊天固定原 islandUid；HTTP Origin 和提交时岛屿校验都保留。离岛/过时消息不转投新岛，自身气泡立即显示，回执不重复弹。访客本地目的地/快照排序不应因自身任务回跳。
6. 跨岛取走/赠送按原请求恢复，与自家可继续操作的队列分清；未知成功不能重发新交易。NPC 布局迁移必须保留元数据及防刷新复活/重复领取规则，不能把 NPC 当作真实玩家。
7. 库存展示分组不合并真实实体，手持不重复计入出售数量；鱼获自动拿在手里时原手持以原 ID 回包。金色/巨型互斥且倍率只应用一次。
8. `uid` 不是安全账号；当前协议不承诺强鉴权、强反作弊或商业级经济安全。聊天/昵称不存敏感信息。

## 最新整版接手重点

- 植物扩充为20种，保留旧目录身份/价格与随机序列兼容；新增异植、图鉴与展示适配。
- 鱼缸管理与高度按实际住鱼需求适配；自家同步期间仍可串门，跨岛取走/原请求持久恢复及 NPC 布局刷新保护继续保留。
- 水色/海面、人物步态与游泳、角色中心环绕镜头、钓竿尺寸、加载与本地动作反馈持续完善；移动花朵阴影每主帧同步，避免阴影跟不上手持/行走。
- 物品详情顶栏返回，卖价独立一行；图鉴一行展示，背包实时件数和彩色分类 tab，分组不改变真实物品身份。
- 四段用户指定音轨映射：购买/拿起/取回/打开背包/收获/鱼获使用进包音；出售使用金币音；建造与抛竿各使用对应音。只保留提取后的音轨及 PCM，不含原视频；不能把用户音轨标成 CC0。
- 生长标签、即时施工操作反馈、投饵/上钩水花、购买图飞入背包和柔化声音保持同版同步；真实12秒施工时序与单次消耗规则未取消。

植物运行资源为10原 GLB 与10 `lib/art/exotic-plants.js` 程序化模型，不是漏了十个 GLB；20鱼也由代码生成。人物12 GLB +12 WebP 全内置，但来源人物建模工程不在包内。`art-source/` 旧物理厘米描述若与现版不符，应以 `physical-contract.js`、空间包络及当前 tests 为准，不能按旧说明重缩放。地块、海底素材、用户指定音轨、具名CC0录音及程序化海浪来源见 ASSETS。

海面多通道渲染后须恢复 renderer 状态；不要覆盖原人物/相机生命周期。静态资源版本缓存、缩略图变体隔离、逐帧气泡坐标、音频真实播放状态均保留。声音不能绕过浏览器手势授权；录制动作 cue 与海浪/SFX/master 总线分层，不因资源重载重复播放。

精确历史恢复代码仅有联合 SHA 绑定和通用算法，没有个人 payload。临时入口不是通用存档上传器；移除时单独维护，保留一般恢复防复发逻辑、已写回执和用户未确认备份。详见 `docs/bounded-journal-recovery.md`。

## 证据与限制

实际检查按 VERIFICATION.md 区分版本；此次 Git 同步不重复完整游戏 QA。云 Chromium/移动尺寸模拟不等于真机，海面 GPU 性能需真实设备验证。lint 历史债务、D1 长尾、轻量身份限制仍在。网络提示降噪不得吞掉需要行动的冲突或持久异常。

仅覆盖当前 demo，保留 Git 历史及其他目录；不新增自动部署、CI、PR、tag 或 release。后续变更应重新运行相应测试/构建，不能沿用历史通过当作新结果。
