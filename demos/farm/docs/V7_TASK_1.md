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
- [ ] RED realbehavior migration/paidfeed/range/cap/hatch/stale/receipts/score tests.
- [ ] Implement; unit + EstateStore integration, report exact failures.
- [ ] Scoped review and fixes.
