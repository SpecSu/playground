# 农场可玩性修复实施计划

> For agentic workers: use subagent-driven-development or executing-plans; preserve the current worktree and saves.

**Goal:** 让现有版本从开场到自由行走、选动物、喂养、动作和保存复访形成可实际操作的流程，先处理用户已报告的阻断与运动问题。

**Architecture:** 服务器继续独占游戏状态与结算。输入命令按实际发送时的会话绑定，教学完成可靠解锁；渲染按带时间戳的权威位置轨迹插值，不从画面位置反复重算追赶路线。新增反馈放入现有Feed和底部抽屉。

**Tech Stack:** React/TypeScript/Three.js，Node24/SQLite，现有Vite构建。

**Spec:** 用户当前“根本体验不了、接着完成”的反馈；GAMEPLAY.md；现有V5.2约束。V5.3检查点暂不合入。

## Global Constraints

- 原分支 codex/animal-farm-companion-demo，390×844 Feed，固定2.5D镜头。
- 保留用户SQLite、身份和关系；所有测试用隔离数据库和构建，验收后备份更新本机5190。
- 不推原GitHub、不发布Sites；只允许Chrome插件画面验收，不用CUA/Playwright替代。
- 不能用HTTP/Node DOM通过冒充WebGL、触控或体验通过。

## Review Focus

- 旧存档停在开场完成节点：无需重复确认即可恢复自由移动。
- enter在途、重试、恢复标签页：命令不使用过期会话，不重复结算。
- 分数坐标、转角和设施入口：轨迹不倒退、越过目标、穿墙或每次快照重置。
- 卡片/遮罩开闭与移动取消：不误点，不隐形锁住；失败原因在当前界面可见。
- 网络延迟和后台恢复：动画时间单调，存档状态不因视觉平滑被改写。

## Tasks

- [x] 输入修复：EstateApp/最小EstateView反馈；真实组件与commandEstate回归先RED后GREEN；完成教学自动握手、发送时session绑定、可见拒绝原因。
- [x] 运动修复：motion-track.ts保存时间/弧长；estate-scene.ts修分数端点路线；EstateWorld统一权威轨迹并平滑朝向/脚步，不改变相机角度。先复现既有折返与冲停，再比较实际方法逐帧轨迹。
- [x] 玩法审计：只修核心流程内有证据的阻断，记录新手能走到的下一步和真正未实现范围。
- [x] 验证与交付（自动检查与本机更新完成；Chrome真实画面仍未验收）：定向回归、全套测试/lint/typecheck、隔离生产构建、HTTP/API和实际React入口；检查Chrome可用性并准确记录视觉缺口；独立复查；备份后更新5190，跨调用确认版本与进程。

已有证据：6489597中的教学完成门禁阻断move；interpolationRoute(6.4→6.9)产生6→7→6.9。旧测试252通过未覆盖用户实测体验，不能作为本轮成功依据。
