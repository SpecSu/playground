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


## Task 3: 同服务真实双客户端护送
Files: src/v7/convoy.ts, ConvoyApp.tsx, ConvoyWorld.ts, convoy.css; server/convoy-store.ts; tests/v7-convoy.test.ts; scripts/v7-convoy-http.mjs.
Owner exclusive coop agent. Root integrates API routing and main entry only.
Interfaces: ConvoyStore(file).command(device,command,now) and .get(device,roomId,now) with JSONreply; export default ConvoyApp. Root exposes sameorigin /api/convoy, farm_device identity. Client query?convoy=ROOM; create/open via existingviewbutton later. Persist room/member/sequence/receipt atomically, different device cookies actual2clients; no publichosting.
Prototype scope: 180 activeonline seconds maximum; NPC herd/ordinarytrainingcargo explicitly无真实资产转移/无金币奖励 (reward economy deferred honestly), one carrier drives herd/cart and cannot guardiancommands, second guard physically opensgate/scouts/usesselectedguardian atdefensepoint. Two legal routes shortexposed vs longcovered; movement/roles/gates/cooldowns/outcomes affect actual state. Noautomatic successanimation; disconnected participant after5s can NPCtakeover while otheractive, bothoffline pause; same task terminalresult once, reconnect resumes. Default NPCcompanion is explicitly标注, caninvite actualsecondwindow andtakeoverrole. Use390×844, fixed2.5D, actualLX/guardian andsimplecart/animals; existingasset helpers. No fullfarmrewriting. Do not call localhost5190 for tests.
- [ ] RED role/collision/gate/route/dt/reconnect/receipt tests.
- [ ] Implement server+client/world, isolated2-cookie HTTP endtoend.
- [ ] Review and fixes.
