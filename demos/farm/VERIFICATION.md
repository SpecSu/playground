# 验证记录 · 2026-10-21

本轮范围：同一 `codex/animal-farm-companion-demo`，完善LX、动物卡片和完整可演示循环；原三个Demo无改动，无Sites发布或GitHub推送。

| 检查 | 实际结果 |
| --- | --- |
| `npm test` | **45/45通过**，包括旧版迁移、LX/身份、性格/学习/记忆、喂草/陪伴、跨页签旧会话重试、奖励/离线幂等、真实Three射线/遮挡和四种标签拖动/键盘激活。 |
| `npm run lint` | 0错误/警告。 |
| `npm run typecheck` | 通过。生产build也执行同一tsc检查。 |
| `npm run build` | Vite8.3.5生产构建通过。 |
| npm依赖审计 | 更新农场原有Vite后，0漏洞；happy-dom仅开发测试使用。 |
| `FARM_URL=…5193 npm run test:http` | 独立SQLite测试实例，45秒真实时间自然闭环通过：喂草→20秒陪伴→三次间隔舞蹈→合拍→真实复访→8团羊毛→舞台/使用，重复结算未多发。见[HTTP证据](./verification/complete-http.json)。 |
| `FARM_URL=…5193 npm run test:dom` | 实际构建JS + 真实独立API：快速切三羊卡、名字准确、场景不卸载、摇杆不误选、保存响应丢失后同ID/原目标重试、LX切换不换身份、双击奖励一次、焦点/Escape通过。见[DOM证据](./verification/dom.json)。 |
| Mac本地最终服务 | [127.0.0.1:5190](http://127.0.0.1:5190)，独立后台PID85673，Node24位于工作区`.local/runtime`，21个HTML/JS/CSS/SVG/GLB/头像响应与构建文件逐字节相同，API实际返回v2/LX/local-sqlite/三羊。见[服务证据](./verification/local-service.json)。 |
| 存档保留 | 两份一致性备份integrity_check通过；现有7份存档身份/动物/已得关系习惯保留，数据库integrity_check正常。仅独立健康身份读取过实际5190 API，完整测试在5193。 |
| 独立代码复查 | 发现2个Important：名字拖动绕过、陪伴重试串会话；均补回归看见失败后修复，45项全绿。无Critical/待处理minor。 |

复查修复后重跑了完整HTTP、DOM、全套单测、lint、typecheck和生产build。测试5193实例已停止；用户5190服务保留。

## 尚未验收

**真实Chrome/WebGL、手机触控与视觉观感未验收。** 当前工具中无独立Chrome插件入口；严格未调用CUA或其他浏览器自动化。Node DOM没有WebGL，会按预期显示明确3D不可用提示；这不是浏览器画面证据。真实GLB测试只跳过Node不支持的纹理解码，保留几何/骨骼和动作有限性验证。

完整版本边界见[GAMEPLAY.md](./GAMEPLAY.md)：无多人/跨设备账号/付费AI/奶龙/抚摸抱起等未实现承诺。当前身份与存档限这台Mac及保留Cookie的浏览器。
