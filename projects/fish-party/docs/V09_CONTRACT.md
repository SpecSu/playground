# v0.9 大版本「独一无二的鱼」—— 三路并行开发契约

> 三个 agent 同时改一个仓库：A = 合成物种引擎，B = 基因实验室 UI + 社交，C = 钓获经济 + 水族箱尺寸。
> 本文是三方唯一的接口约定。谁改了接口，必须同步更新本文件对应小节。

## 0. 产品目标（用户原话提炼）
- 所有钓上来的鱼 = 它本来的样子。**没有装扮系统**，鱼不能被装扮。
- 「变异 + 融合 + 装扮」三合一 → **基因改造**：
  - 主鱼（发起改造的那条，自己的） + 鱼槽（必填：另一条自己的鱼） + 道具槽（选填：背包任意一个怪东西，如西装/马桶/钥匙）+ 一句话方向（选填，最多 30 字）
  - → 孵化 → 揭晓 → **引导用户给它命名** → 一条不属于任何物种的、代码合成的全新海洋生物
  - 外观像有无数种排列组合、完全无法预测，但又和两条亲本 + 道具有千丝万缕的联系
- 合成鱼可放生 → 被别人钓到 → 再次融合成新的稀缺物种（循环）
- 道具变稀缺；暂时去掉宝箱 / 漂流瓶；只能钓到水生物 + 稀有道具；道具唯一用途 = 影响融合后的性状
- 水族箱鱼尺寸差异拉大，大鱼可以游出屏幕边缘
- 串门：可送鱼（无上限）、偷鱼（每天全局最多 1 条，随机）；成功后对方收到通知（好友是 NPC → 用模拟回执/对方来信体现）

## 1. 数据模型：合成鱼 variant
```js
{
  uid, id,                 // 照旧
  sp: 'synth',             // 固定。A 在 fishes.js 注册隐藏物种 SPECIES_BY_ID.synth（不进钓鱼随机池），保证所有 SPECIES_BY_ID[v.sp] 访问不崩
  syn: { ...genome },      // A 定义的完整基因组（纯 JSON，可存 localStorage，≤ ~2KB）
  name: '用户起的名字',      // 未命名前 = A 生成的默认名（synthName）
  rarity: 'rare'|'epic'|'legendary'|'mythic',  // 合成鱼最低 rare；由基因稀有度算
  cm, kg, gen,             // gen = max(a.gen, b.gen) + 1
  parents: [{ uid, name, sp, syn? 不存 }, { ... }],   // 只存摘要
  item: null | itemId,     // 注意：与旧的 v.item={id,n}（道具漂流物）区分 → 合成鱼用 v.synItem
  synItem: null | itemId,
  prompt: '',
  creator: '玩家昵称',      // 造它的人
  seed,                    // 32bit
  fp: 'A3F9-…',            // 基因指纹，展示「全宇宙唯一编号」
  traits: [],              // 兼容旧 UI，可为空
}
```

## 2. A 提供的 API（src/synth.js）
```js
export function synthesize({ a, b, item = null, prompt = '', seed, creator = '' }) // → variant（上面结构，name=默认名）
export function previewHints({ a, b, item, prompt })   // → { tags: ['可能长出钥匙齿背鳍', '陶瓷质感', ...], risk: 0~1 } 给实验室界面做「基因预感」
export function wildSynth(seed, creator)              // → 一条「别的玩家造的」合成鱼（给海洋回流 / NPC 好友水族箱 / NPC 送鱼用）
export function synthName(v)                          // → 默认名（如「镀铜钥齿·双尾灯笼鳗」）
export function genomeOf(v)                           // → 任意鱼（天然物种或合成鱼）的基因组（天然物种由物种特征推导）
export function buildSynthModel(v)                    // → THREE.Group，由 Fish 类在 v.sp==='synth' 时调用；带 userData 供游动动画使用
export function synthTags(v)                          // → 卡片上展示的 2~4 个性状短标签
```
- A 同时负责：items.js 道具表改成「怪东西」（西装、马桶、钥匙…），保留字段 `id,name,emoji,icon,cat,rarity,color,desc`，新增 `motif`（对基因的影响）；保留导出名 `ITEMS, ITEM_BY_ID, ITEM_IDS, ITEM_CATS, ITEM_RARITY, ITEM_RARITY_ORDER, STARTER_PACK, rollItemDrop, rollItemCatch, itemLabel, ITEM_CATCH_P`（C 只调概率常量）
- A 负责 Fish 类（fishes.js `class Fish`）接入合成鱼渲染、缩略图（fishThumb）能正常出图
- **A1 引擎已落地（src/synth.js，bridge 已切到真引擎，`STUB` 不再导出）**：未拆分 synth_genome.js，synth.js 直接 import synth_model.js 的 `normGenome / G_DEFAULT / MATS / PAT_IDS`；`buildSynthModel` 是 wrapper（`SM.buildSynthModel` 存在就调用，否则返回 null）
  - 基因组在 G_DEFAULT 之外的额外字段（normGenome 透传，A2 构建器可选用）：`asym` 0~1 对称破缺、`tail.n=2` 双尾、`eyes.n` 0~7（0=水母/海星无眼）、`anc` 祖先谱系 `{sp:权重}`、`wild` 狂野突变 id[]、`tags` 卡片标签、`item` 道具 id
  - 形状词表 `SHAPES`（plan/head/mouth/dor/tail/pect/app 全部取值）与 40 种天然伪基因组 `NATURAL` 均从 synth.js 导出；app 形如 `tentacle:8` / `legs:6` / `arms:5` / `claws:club` / `horn:spiral` / `mane:knit` …
  - node 测试：`node --import ./tools/v09a/three_loader.mjs tools/v09a/sim_synth.mjs 1000`（loader 把 'three' 映射到 vendor）

## 3. B 负责（UI / 流程 / 社交）
- 水族箱里点鱼 → 唯一入口「基因改造」（删除旧的 装扮 / 变异 / 融合 / 选3个道具 分支 UI）
- 实验室：主鱼 + 鱼槽 + 道具槽 + 一句话 + 「基因预感」(previewHints) → 开始孵化（复用卵/孵化机制：meta.startEgg）→ 揭晓卡 → 命名（必经一步，可用默认名一键确认 / 骰子换名）
- 消耗：两条亲本都消耗（被合成进新鱼），道具消耗 1
- 串门：送鱼（无上限）/ 偷鱼（每日 1 次，随机一条）+ 通知（toast + 收件箱 + NPC 回执）；NPC 好友偶尔也会送你鱼 / 偷你鱼 → 收件箱通知
- meta.js 新状态字段：`S.stealDay`, `S.friendTanks[fid]`（送出去的鱼 / 被偷走后剩余）等由 B 定义并写到这里

### 3.1 B 已落地的状态字段（meta.js，旧存档在 createMeta 里自动补齐）
| 字段 | 类型 | 说明 |
|---|---|---|
| `S.friendTanks[fid]` | `{ fish: variant[], stub: bool, t }` | 好友水族箱，首次串门生成（6~9 条天然鱼 + 1~2 条 `wildSynth`），之后持久化；`stub` 与当前合成引擎不一致时重新生成，但保留 `via` 标记的鱼 |
| `S.stealDay` | `'YYYY-MM-DD' \| null` | 全局偷鱼日（每天 1 次，`STEAL_PER_DAY`） |
| `S.npcQueue` | `{ due, fid, kind:'thanks'\|'npc', text }[]` | NPC 延迟回执（送鱼感谢 / 被偷留言），到期写入收件箱，最多 12 条 |
| `S.npcNext` | `ms` | 下一次 NPC 主动互动时间（25~55 分钟一次，首次 12~30 分钟） |
| `S.npcDay` | `{ d, gift, steal }` | NPC 当日计数：每天最多送你 2 次、带走 1 次（只带走普通天然鱼，水族箱 <4 条不带） |
| `S.inbox[].kind` | 新增 `gift` / `thanks` / `steal` / `npc` / `synth` | 收件箱类型（图标 / 底色区分） |

variant / egg 新增：
- 蛋 `egg.kind = 'synth'`（`EGG_DUR.synth = 90s`），`egg.src` = 两条亲本快照，`egg.synItem` / `egg.prompt`；`egg.result` 在开始孵化时已由 `synthesize` 算好
- 合成鱼 `v.unnamed = true`（孵出未命名，点它会先进命名）→ 命名后 `v.named = true`、`v.name`（同步 `v.nick`）；`displayName` 对合成鱼优先 `v.name`
- 好友 / 社交来源：`v.via = 'gift' | 'took'`（在好友缸里：你送的 / 从你家带走的），`v.giftFrom = { id, name, t }`，`v.stolenFrom = { id, name, t }`

meta API（B）：`startSynthEgg({a,b,item,prompt})`、`nameFish(uid,name)`、`friendTank(fid)`、`stealLeft()`、`giveFish(fid,uid)`、`stealFish(fid)`、`socialTick(now, force, allowAct)`；`meta.synth` = 合成引擎（经 `src/synth_bridge.js`）

合成引擎接入：B 侧一律 `import * from './synth_bridge.js'`。A 的 `src/synth.js` 未就位时桥接到 `src/synth_stub.js`（契约同签名的占位实现）；就位后把 bridge 里那一行改成 `export * from './synth.js';` 即可（好友水族箱会因 `stub` 标记自动重建）。

## 4. C 负责（钓获 / 经济 / 水族箱）
- rollCatch：去掉宝箱/漂流瓶/小黄鸭和道具漂流物外观里的宝箱、漂流瓶；道具概率降低（目标：平均 ~12 杆 1 个道具，史诗/传说更稀有）
- 钓上来的天然鱼不再带随机「派对基因」装扮（gx.extras 等）——原样
- 海洋回流（oceanCatch / S.ocean）：玩家放生的合成鱼可被（模拟的）别人钓走；玩家也有概率钓到别人造的合成鱼（wildSynth）——稀有、惊喜
- 水族箱 aquarium.js：鱼尺寸差异拉大（巨型鱼可超出屏幕边缘），合成鱼按 cm 正常参与
- 钓获卡 / 图鉴对合成鱼展示：名字 + 「新物种 · 第 N 代 · 指纹」

## 5. 协作规则
- 不要 `git commit`，不要 `write_file` 覆盖别人负责的文件；改共享文件（fishes.js / genes.js / meta.js / main.js / index.html）只用 search_replace_file 小块替换，替换前重新 read 那一段
- 预览服务：http://127.0.0.1:8960/index.html （cd fish-party && python3 -m http.server 8960）
- 截图：tools/shot.py（Playwright + swiftshader），截图放 shots/v09/<A|B|C>/
- 最多同时 4 个 agent（整个会话），不要再开子 agent
