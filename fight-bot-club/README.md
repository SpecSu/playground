# Fight Bot Club · UGC 机器人对战擂台（v8）

移动端 3D 机器人对战擂台：输入一句话即可生成专属机甲，排队上擂台自动对战。基于 Three.js + Vite。

- 线上地址：https://c9f24586d214.aime-site.bytedance.net
- 版本：v8-keep（2026-10-30）

## v8 包含
- 扁平化 UI 新色系：亮黄绿 `#DEFF72` 主色 / 玫红 `#F569A8` 辅色 / 淡紫 `#B7A4FF` / 薄荷青 `#7FE5CD` / 香蕉黄 `#FFE135` + 黑 `#171719` / 深灰 `#232126` / 暖白 `#F5F4F0`
- 机甲随机配色规则 v13（`tools/palette-lab/rule_v13.js`）
  - 明度结构：主装甲 / 金属件 / 副装甲分处暗、中、亮三档
  - 鲜艳色（5 色 + 黄铜）每台最多 2 种，且一主一次（次色只上细节和发光）
  - 主题色大面积装甲做金属烤漆；允许中性主体（黑白灰 + 少量亮色点缀）
  - 涂装左右镜像对称，无阴阳配色
- 创建面板 3D 预览光照与擂台一致
- 擂台灯光 / 观众灯 / 围栏 / 角柱 / 地面统一新色系，bloom 光污染修复
- READY / FIGHT / K.O. / WINNER / VS 报幕样式重做
- 修复：连续点随机生成时模型堆叠

## 目录
| 路径 | 说明 |
|---|---|
| `src/` | 游戏源码（v7/v8 的大部分视觉改动以补丁形式在构建产物上生效，以 `dist/` 为准） |
| `tools/build_mockup.py` | 基于 `tools/v6_base` 构建产物打补丁，生成 `dist/mockup`；`--promote` 同步到 `dist/` |
| `tools/palette-lab/` | 机甲配色实验室：规则文件（v9~v13）、12 台抽样预览页、截图与量化指标脚本 |
| `dist/` | v8 线上构建产物（可直接静态托管，入口 `dist/index.html`） |
| `public/` | 字体、音频等静态资源 |

## 本地运行
```bash
npm install
npm run dev                       # 开发（v6 源码）
python3 tools/build_mockup.py     # 生成 dist/mockup（v8 补丁版）
python3 tools/build_mockup.py --promote   # 同步到 dist/
npx vite preview                  # 预览 dist
```


## v8.5 更新（2026-10-30）
- 光污染修复：v13 金属漆改为缎面金属（metalness .55 / roughness ≥.4），机甲自发光 1.6→1.25，近白发光再压 30%，花纹发光 .45→.32
- 擂台三条围栏发光降档：彩色 .42→.2，白色 .75→.3
- WINNER 镜头：锁定胜者正前方 ±30° 缓摆，对准驾驶舱座位，看清驾驶员正脸
- WINNER 构图：驾驶员脸位于画面上部，WINNER 字组下移至 47%，避开候场区
- 分身胜利庆祝：双手保持握操纵杆，改为摇头晃脑+身体摇摆，全分身统一，杜绝穿模
