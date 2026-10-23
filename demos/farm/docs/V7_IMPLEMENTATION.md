# V7 收获、风险与合作 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development / test-driven-development. Each owner edits only its files; reports and independent review precede completion.

**Goal:** 稀有产物—公开价出售/合成—粮食和品质领养—承载预览—多狼与有限损失—本机估值闭环，加真实同服务双客户端护送原型和诚实偶遇卡入口。
**Architecture:** 保留既有Estate/SQLite事务与Three场景；独立V7经济和风险模块，旧币字段materials原值改称金币，不另复制余额。新护送房间有独立权威状态/收据，设备身份，不宣称公网好友。
**Tech Stack:** Node24.9、SQLite、React19、Three、Vite；不新增外部/付费服务。
**Spec:** docs/V7_SOURCE.md（Notion 2026-10-23T04:32:49.464Z）

## Global Constraints
- 同一分支/工作区，390×844、固定2.5D、底部不遮挡小卡、现LX和守护者资产；不改旧3 Demo。
- 保留动物ID/关系/旧库存版本和兑换权；自然档与演示档隔离；不清用户档。
- 仅Chrome插件视觉验收；无工具则标未验，不使用CUA/Playwright。
- 不创建凭据/付费服务/安全设置；用户视频和私密参考不入git。AI预算未知不装成功。
- 最终备份最新SQLite和构建，原5190独立后台更新；正常push origin codex/animal-farm-companion-demo，禁止force/main。
- 本文未在原文指定的数值都是本轮可配置试验值；文档和UI明确说明。

## Review Focus
- 跨版本/离线/时钟倒退/反复领取不能复制产物或把旧兑换权抹掉。
- 购买和孵化分开，旧预览失效/连点/重试不能超容量或双扣。
- 事件只掠夺开场暴露批次，最多floor(20%)；正常库存不动，后台不推进危险。
- 估值只读真实有效实体；库存/现金/蛋/外观/拆建不能刷分。
- 双客户端重连/抢角色/旧序列/退出不重置护送或重复奖励；本地身份不冒充真人好友。

## Task 1: V7经济、承载、估值
Files: src/v5/v7-economy.ts (new), estate-cycle.ts, estate.ts, herd-economy.ts; tests/v7-economy.test.ts and integration tests.
Owner exclusive: economy agent. Root does not edit these until owner done.
Interfaces: export V7State; ensureV7(p,now), settleV7(p,now), v7Command(p,c,now), previewHatch(p,tier), estateValuation(p), v7Summary(p,now), productionStatus(p,animalId). p.v7 contains feed, eggs, perAnimal production clocks, recovery map, loss receipts. Keep p.production.pending as common pending ledger; add WoolLot.version='v7'; v6 timers stop after migration, existing lots remain.
Trial rules: materials is sole game coin balance, 1:1 existing; wool sale white/green/blue/red/gold=2/6/18/54/162; explicit legacy exchange remains1/2/4/7/12. Adjacent synthesis3→1 plus2coins (no buying materials/resale loop). Buy10 production feed=10coins; initial one-time24 feed. Health food existingfree cannot feed production ledger. Per living animal natural12h/lab30s production by rarity, 2 units base +1 adolescent/adult +1 after9 valid care, capped4; each animal max6batches, max6offlinecycles. Paid feed percycle1/2/3/5/8 byrarity; nofeed/ injured/lost/shelter-inaccessible => no new production and no backpay. More animals (max12) all produce, no6slotcap/rare-target.
Boxes explicit sheep species+rarity at60/180/500/1400/4000coins; existing white adopt20 replaced by purchase+confirm hatch (preserve old command as safe rejected or redirects, no bypass). preview/confirm shows coins, total daily feed demand, feed gap, land demand, reachablebeds, future raid band. Need next24hfeed, accessiblebed peranimal and walkableowned land2/3/4/6/9units peranimal. Hatch assigns uniqueid andlife; no randomquality. Confirm validates again+expected layout/version/count; buyingbox doesnot give score. Cancellation keepsbox, no refunds duplicate.
Valuation living animal10/30/80/180/400; same species+rarity first3 full, rest20%. Each valid connected builtkind max3 × official BUILDING_RULES cost; equipped cape4/shield16 only; inventory/coins/eggs/patterns/signature0. Label本机估值, no remote entries.
- [x] RED realbehavior migration/paidfeed/range/cap/hatch/stale/receipts/score tests.
- [x] Implement; unit + EstateStore integration, report exact failures.
- [x] Scoped review and fixes.

## Task 2: V7风险与损失
Files: raid-cycle.ts, threat.ts, v7-risk.ts(new); tests/v7-risk.test.ts.
Owner exclusive risk agent. Coordinate contracts with economy; no estate.ts edits.
Interfaces: raidRisk derives herd; createThreat options optional pressure band affects actual wolf speed/windup (not justcount). export beginV7Raid(p,event), observeV7Raid(p,event), recoverySummary(p), canRecoverV7(p,target). V7State.recovery map shared with economy; propose exact contract to economy before writing.
Rules: pressure=count+sum(rarity-1)*0.75; low<6:1wolf8–14min,speed1; medium<11:2wolves5–9min,speed1.1; high:3wolves3–6min,speed1.2; attackwindup floor1.5s (low2/medium1.8/high1.5), visible12swarning and existingdaily/hourcaps. Tutorial/rehearsal unchanged. Only natural event begins exposure snapshot. Wolf within1.5 of unprotected producer or genuine attack may take from thatanimal's opening pending lots, deterministic integer deduction cappedfloor(each tier opening exposed*.2) plus total cap, warehouse untouched; per-event/lot ledger prevents repeats. Blockinstant claim while natural eventactive. Injured/lost stop production until actual3s manualcare/rescue; recovery costs explicit8coins+2productionfeed injury /16coins+4feed lost, charged once at successfulcompletion, nofreefindback bypass; insufficientcash can earn fromsafeanimals, no permanent defaultdeletion. Economy integrates hooks and feeds/rescue workflow.
- [x] RED actualwolfpath/damage/loss/20%/warehouse/retry/pause/recovery tests.
- [x] Implement and send exact integration calls to economy.
- [x] Scoped review and fixes.

## Task 3: 同服务真实双客户端护送
Files: src/v7/convoy.ts, ConvoyApp.tsx, ConvoyWorld.ts, convoy.css; server/convoy-store.ts; tests/v7-convoy.test.ts; scripts/v7-convoy-http.mjs.
Owner exclusive coop agent. Root integrates API routing and main entry only.
Interfaces: ConvoyStore(file).command(device,command,now) and .get(device,roomId,now) with JSONreply; export default ConvoyApp. Root exposes sameorigin /api/convoy, farm_device identity. Client query?convoy=ROOM; create/open via existingviewbutton later. Persist room/member/sequence/receipt atomically, different device cookies actual2clients; no publichosting.
Prototype scope: 180 activeonline seconds maximum; NPC herd/ordinarytrainingcargo explicitly无真实资产转移/无金币奖励 (reward economy deferred honestly), one carrier drives herd/cart and cannot guardiancommands, second guard physically opensgate/scouts/usesselectedguardian atdefensepoint. Two legal routes shortexposed vs longcovered; movement/roles/gates/cooldowns/outcomes affect actual state. Noautomatic successanimation; disconnected participant after5s can NPCtakeover while otheractive, bothoffline pause; same task terminalresult once, reconnect resumes. Default NPCcompanion is explicitly标注, caninvite actualsecondwindow andtakeoverrole. Use390×844, fixed2.5D, actualLX/guardian andsimplecart/animals; existingasset helpers. No fullfarmrewriting. Do not call localhost5190 for tests.
- [x] RED role/collision/gate/route/dt/reconnect/receipt tests.
- [x] Implement server+client/world, isolated2-cookie HTTP endtoend.
- [x] Review and fixes.

## Task 4: 经济小卡UI
Files: FarmCyclePanel.tsx, farm-cycle.css, src/v7/MarketPanel.tsx(new) ifneeded; tests/v7-market-ui.test.ts.
Owner exclusive UI agent; depends Task1 exportedhelpers. Preserve3tabs layout, cards/scene not dashboard. Show金币/paidfeed, rarity-linked yields/healthproductionstop, sale/synthesis visibleprice, boxpreview→explicit hatch→needs/pressure,本机估值. Legacy rights details retained. Numeric production tier label replaces independentLv production. Raidrules matchTask2. First-loop simple guidance and2-click clearactions. Roothandles EstateView/App navigation andglobalcoinlabels.
- [x] RED actualReact buttons/preview/cancel/pending/semantics tests.
- [x] Implement against helpercontracts, no duplicated settlement.
- [x] Review.

## Task 5: 偶遇卡、开放采收与整体集成 (root)
Files src/v7/encounter.ts, EncounterPanel.tsx, server/estate-store.ts, server/index.ts, EstateApp/View.tsx; tests/v7-encounter andharvest tests.
Visiblecard uses actualcurrentavatar+guardian portrait andrealrecordedevent summary, 12s proposedvideo, budgetunknown, generationunavailable. Submit records idempotent unavailablejob/preservesdraft with no resourcecost, no prerecorded video. Close/skip returnsfarm. No userreference download needed.
Asynchronous collection same-server explicitowneropen token, real seconddeviceonly; per mature ordinary pool (across batches) aggregate10%floor (no takeif<1), visitorUTCday1/ownerday3; no rare/warehouse/locked/currentthreat; ownercanclose. CrossestateSQLitetransaction transfers actuallot once. If UI boundary cannot become clear inthisslice, report unintegrated ratherthan fakefriend.
- [x] RED job/facts/nocharge/harvestpermission/cap/dup tests, implement andintegrate.
- [x] Current camera/input/drag/firstfeed/workshop regression.
- [x] Wholebranchreview, alltests/lint/typecheck/build, copiedsave migration andisolatedHTTP/actualReact.
- [ ] BackuplatestSQLite/build, localupdate, crosscallPID/resourceverification, secrets/privatefiles diffcheck.
- [ ] Normalpushwithupstream exactbranch; readremoteSHA equalscommit. Reportactualruntime andmissingexternalservices.

## Progress
2026-10-23: 完成全部五个模块与交叉审查。全量586测试、lint、typecheck、1875模块生产构建通过；双设备采收、经济HTTP、28静态资源以及独立分享入口已通过。最终护送与完整生产React流程也通过。5190暂仍为V6/PID10414，等待备份更新与正常分支推送。真实Chrome/WebGL未验收。

最终审查修正：活动事件期间停产且不补发；孵化预览取消/旧版本拒绝；各品质分别限制20%掠夺；移动时间不算连续治疗；采收GET结算、读取失败恢复、独立访客入口；运货键盘路线与关门碰撞；估值唯一实体ID去重。
