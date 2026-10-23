# V6 经济面板交付

范围：FarmCyclePanel.tsx、farm-cycle.css、经济面板相关 DOM tests。没有修改服务、数据库、dist、EstateView 或 App。

- 保留按需打开的产物/守护/来袭面板。产物页展示当前生产位、单批2份白毛、12小时周期、每日预算、6批上限及换位完整周期规则。
- 单一稀有目标按动物与蓝/红/金选择，显示Lv.3/4/5门槛、2/6/14周期与当前进度。下周期切换、旧进度保留规则可折叠阅读。
- 新毛说明优先用途；白2→绿1发送processGreen。旧毛按来源明示，旧兑换权在折叠区，单份发送woolVersion=legacy；没有一键全卖。
- 纯标签培育入口停用，保留标签说明。AnimalProduction接收production时显示该动物真实pending，不再读取旧10分钟生产摘要。
- 保留守护者、入口升级与领养。来袭说明明确稀有度和财富不增压。
- 新增onCraft回调；根集成须将它连接工作坊，并向AnimalProduction透传production。

验证：先新增实际DOM交互测试，观测缺少3/6生产位规则的RED；随后实现。

```
.local/runtime/node --import ./tests/view-loader.mjs --experimental-strip-types --test tests/v6-economy-ui.test.ts tests/v525-cycle-ui.test.ts tests/v525-view-flow.test.ts
```

19/19通过，覆盖领取、逐份旧兑换与重复点击保护、加工、做披风回调、目标选择、换位、标签暂停、财富和稀有不增压、升级和领养约束。旧测试按V6规则修正，未删除覆盖。

本模块eslint通过。全局tsc执行时存在其他并行模块尚未完成的WorkshopPanel/WorkshopPattern错误；本模块相关类型错误已修正。未执行浏览器WebGL视觉验收。
