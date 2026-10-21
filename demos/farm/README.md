# 绒绒农场 · 本机可玩 Demo

独立 React / Three.js / Vite 工程，基于仓库 `main@5d60a20`。不修改三个归档 Demo。

当前预览：<http://127.0.0.1:5190>。需要 **Node 24.9.0+**：

```sh
npm ci
npm run build
npm start
```

这台 Mac 的已安装运行时可直接启动：

```sh
PATH=/tmp/farm-node-runtime/node_modules/node/bin:$PATH npm start
```

本地 `.local/farm.sqlite` 保存设备身份下的农场；不要删该文件或清 Cookie。换分身不改变关系身份。不宣称跨设备账号。`npm run dev` 使用同一个本地适配。已新增独立 Sites 工程在 `../../../../farm-site`（同一任务工作区），通过官方 Vinext Worker + D1 发布；其云端状态与本机 SQLite 独立。

## 试玩

1. 默认对大家跳舞，观察皮皮靠近跟拍、茉茉先动耳朵再小幅回应、豆豆改编侧步。
2. 同动作间隔至少 12 秒，三次会从观察→模仿→主动邀请；连点不增加进度。
3. 奶蛙合拍后，刷新或点「体验下次来访」。迎接来自真实保存的习惯，快进明确标注为演示。
4. 星点卷毛可保留或恢复普通，羊名、性格、关系保留。它是规则驱动原型。
5. 自然羊毛每30分钟1团，上限12。演示来访快进6小时；领取8团兑换软垫舞台，解锁一起蹦。

点击草地、WASD/方向键或触屏方向盘移动，点击羊或住民卡片选择对象。手机点右上羊毛按钮打开篮子。仅使用已有喵脆角、香蕉猫、奶蛙 GLB 与 portraits；骨骼渲染器来自 `disco/lib`，羊/场景为程序化几何。未声称有奶龙、抚摸、抱起、喂食或付费生成。

## 验证和边界

`npm test`、`npm run lint`、`npm run typecheck`、`npm run build`。`scripts/http-smoke.mjs` 对指定 FARM_URL 使用新测试设备身份跑30秒真实学习闭环；测试应指向独立实例。数据库重开、重复领取/购买和新用户初始化有独立回归。

独立 Chrome 插件工具在本次任务不可用，严格未用 CUA/替代浏览器。Node DOM 已运行实际构建入口，能挂载完整控件且零入口异常，但无法验证 WebGL、手机构图、触控或观感。用户反馈的实际浏览器空白原因尚未定位，已加静态首屏兜底、React 错误边界与运行时诊断（本地 `/api/diagnostics`）；不能称视觉验收通过。

本地 SQLite 是 Node 实验模块，会打印标准 ExperimentalWarning。模型测试保留真实几何与骨骼，跳过 Node 不支持的图片解码；不声称纹理/WebGL 已验收。角色来源及许可边界沿用仓库 `THIRD_PARTY_NOTICES.md` 和 `docs/assets-and-provenance.md`。
