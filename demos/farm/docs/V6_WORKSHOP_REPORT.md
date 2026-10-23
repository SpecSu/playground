# V6 制作模块验收

范围：新增 `src/v5/workshop.ts`、`tests/v6-workshop.test.ts`；没有修改服务、存档或构建产物。

已实现：4+白披风/旗、8+绿路标、16+蓝盾、8+金动物永久签名；首件披风或旗一次免费试制；lab一次免费借盾；原批次羊毛实付账本；材料80%向下取整退款；赠品不返料；永久签名不可拆。命令ID持久幂等，确认/装配/图案改版/退款重新校验工作坊及世界版本。草稿免费，图案参数限制、SVG防注入、真实动物和事件校验，官方和用户编辑来源及历史版本持久保存。

装备：独立披风和盾槽，旗与路标为无碰撞装饰放在已拥有可走陆地；狗盾只在预设合法锚点应用，事件中不能改变战术/锚点。`workshopTactic` 仅当前守护者为狗时导出有效盾战术。实际部署安全由战术模块进行路径检查。可卸装/收起/重新摆放；图案更新或视觉回退生成新版本，不回滚物资。永久签名通过 `workshop-use-signature` 免费应用到已拥有披风/旗，ID导出的稳定旋转/缩放保留个体差异和原动物/事件来源。

生成：capability generation=unavailable、budget=unknown。请求持久保存 unavailable 任务、不扣任何游戏资源；命令不能接受已审核成功资产。提供未来服务端适配接口类型，当前不连接实际provider。未将官方款宣传成AI。

主接入：Profile添加可选workshop字段；调用ensureWorkshop迁移；将workshopCommand路由纳入外层原子receipt；战术接入workshopTactic。命令名和类型以模块export为准。

验证：先写3个行为测试，运行确认全部因模块不存在失败，再实现。最终7个行为测试通过，覆盖试制、退款幂等与原来源、永久签名、来源校验、过期版本、未连接生成、参数异常、视觉版本、独立演示借盾和锚点。命令：

```
.local/runtime/node --import ./tests/view-loader.mjs --experimental-strip-types --test tests/v6-workshop.test.ts
.local/runtime/node node_modules/eslint/bin/eslint.js src/v5/workshop.ts tests/v6-workshop.test.ts
```

结果：7/7通过，定向lint通过。全局typecheck当时受并行Profile.production/creation.projects/UI集成未完成影响；workshop.ts无自身类型错误。最终全局检查由主集成代理完成。
