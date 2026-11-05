// v0.9 B：基因实验室 / 揭晓 + 命名 / 串门送鱼·偷鱼 样式（由 tank_ui.js 动态注入，不改 index.html）
// 视觉：沿用水族箱奶油底 + 墨色文字；细线 1px 描边、选中态 = 墨色描边；主按钮仍是全局唯一的珊瑚粉
export const GENE_LAB_CSS = `
#tank .gl-k{font-size:11px;font-weight:700;letter-spacing:.18em;color:var(--ink3);line-height:1.4}
#tank .gl-hd{flex:none;padding-right:52px;min-height:44px}
#tank .gl-hd b{display:block;font-size:20px;font-weight:800;line-height:1.25;margin-top:1px;color:var(--ink)}
#tank .gl-hd span{display:block;font-size:var(--f1);font-weight:600;color:var(--ink2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#tank .gl-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:28px}
#tank .gl-lbl{font-size:var(--f1);font-weight:700;color:var(--ink2);letter-spacing:.06em;white-space:nowrap}

/* 公式行：主鱼 × 鱼槽 + 道具 */
#tank .gl-fx{flex:none;display:grid;grid-template-columns:minmax(0,1fr) 14px minmax(0,1fr) 14px minmax(0,1fr);align-items:stretch;gap:4px;margin-top:12px}
#tank .gl-node{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;padding:7px 6px 8px;border-radius:18px;background:#fff;box-shadow:0 0 0 1px var(--line) inset;border:0;font-family:inherit;transition:box-shadow .2s,transform .3s var(--spring)}
#tank button.gl-node:active{transform:scale(.97);transition-duration:.06s}
#tank .gl-node.act{box-shadow:0 0 0 1.5px var(--ink) inset}
#tank .gl-th{width:100%;height:50px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:var(--ink3);background:linear-gradient(160deg,#f8f4ee,#f0e9df);overflow:hidden}
#tank .gl-node.main .gl-th{background:linear-gradient(160deg,#eef6f4,#e2eeec)}
#tank .gl-node.need .gl-th{background:transparent;box-shadow:0 0 0 1px #e3d6c5 inset;border-radius:12px}
#tank .gl-node.need.act .gl-th{box-shadow:0 0 0 1px var(--ink3) inset}
#tank .gl-th svg.i{width:18px;height:18px;stroke-width:1.8}
#tank .gl-th img{width:100%;height:100%;object-fit:contain}
#tank .gl-th img:not(.ok){visibility:hidden}
#tank .gl-node b{font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--ink3);margin-top:4px;white-space:nowrap}
#tank .gl-node span{font-size:var(--f1);font-weight:700;color:var(--ink);max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.35}
#tank .gl-node.need span{color:var(--ink3);font-weight:600}
#tank .gl-op{align-self:center;margin-top:-22px;font-style:normal;font-weight:400;font-size:15px;color:var(--ink3);text-align:center}
#tank .gl-ico{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;font-style:normal;font-size:18px;line-height:1;flex:none;background:color-mix(in srgb,var(--ic,#e9e2d8) 20%,#fff);box-shadow:0 0 0 1px color-mix(in srgb,var(--ic,#e9e2d8) 35%,transparent) inset}
#tank .gl-ico.lg{width:40px;height:40px;font-size:21px}
#tank .gl-ico svg.i{width:15px;height:15px;color:var(--ink3);stroke-width:1.8}

/* 选择器：细下划线 tab + 网格 */
#tank .gl-pick{flex:1;min-height:120px;display:flex;flex-direction:column;margin-top:12px}
#tank .gl-seg{flex:none;display:flex;gap:20px;border-bottom:1px solid var(--line);padding:0 2px}
#tank .gl-seg button{position:relative;height:34px;padding:0;border:0;background:none;font-family:inherit;font-size:var(--f2);font-weight:700;color:var(--ink3);display:flex;align-items:center;gap:5px}
#tank .gl-seg button small{font-size:11px;font-weight:700;color:var(--ink3)}
#tank .gl-seg button.on{color:var(--ink)}
#tank .gl-seg button.on::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:1px;background:var(--ink)}
#tank .gl-scroll{flex:1;min-height:0;overflow-y:auto;padding:10px 2px 6px;touch-action:pan-y;scrollbar-width:none}
#tank .gl-scroll::-webkit-scrollbar{display:none}
#tank .gl-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
#tank .gl-cell{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0;padding:6px 4px 7px;border:0;border-radius:14px;background:#fff;box-shadow:0 0 0 1px var(--line) inset;font-family:inherit;transition:box-shadow .2s,transform .3s var(--spring)}
#tank .gl-cell:active{transform:scale(.96);transition-duration:.06s}
#tank .gl-cell img{width:100%;height:38px;object-fit:contain}
#tank .gl-cell img:not(.ok){visibility:hidden}
#tank .gl-cell:has(img:not(.ok))::before{content:'';position:absolute;left:50%;top:12px;width:36px;height:22px;margin-left:-18px;border-radius:50%;background:var(--bg2);animation:thPulse 1.1s ease-in-out infinite alternate}
#tank .gl-cell>span:not(.gl-ico){font-size:var(--f1);font-weight:600;color:var(--ink);max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}
#tank .gl-cell.on{box-shadow:0 0 0 1.5px var(--ink) inset;background:#fffdf9}
#tank .gl-cell.on::after{content:'';position:absolute;right:6px;top:6px;width:6px;height:6px;border-radius:50%;background:var(--ink)}
#tank .gl-syn{position:absolute;left:5px;top:5px;font-style:normal;font-size:10px;font-weight:700;letter-spacing:.04em;color:#9a7440;background:#f6eedf;border-radius:6px;padding:0 4px;line-height:15px}
#tank .gl-cell.it{padding-top:9px}
#tank .gl-cell.it em{position:absolute;right:6px;top:4px;font-style:normal;font-size:10.5px;font-weight:700;color:var(--ink3)}
#tank .gl-cell.it.on em{right:14px}
#tank .gl-cell .gl-rd{position:absolute;left:7px;top:7px;width:5px;height:5px;border-radius:50%}
#tank .gl-cell.it.none span:not(.gl-ico){color:var(--ink2)}
#tank .gl-empty{display:flex;flex-direction:column;align-items:center;gap:4px;padding:18px 8px 6px;text-align:center}
#tank .gl-empty b{font-size:var(--f2);font-weight:800;color:var(--ink)}
#tank .gl-empty span{font-size:var(--f1);color:var(--ink2);font-weight:600}
#tank .gl-empty .tk-btn{margin-top:10px}
#tank .gl-note{font-size:var(--f1);color:var(--ink3);text-align:center;margin-top:10px;font-weight:600}

/* 一句话 */
#tank .gl-say{flex:none;margin-top:10px}
#tank .gl-insp{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border:0;border-radius:999px;background:transparent;box-shadow:0 0 0 1px var(--line) inset;font-family:inherit;font-size:var(--f1);font-weight:700;color:var(--ink2)}
#tank .gl-insp svg.i{width:13px;height:13px;stroke-width:2}
#tank .gl-insp:active{background:var(--bg2)}
#tank .gl-in{position:relative;margin-top:6px}
#tank .gl-in input,#tank .gl-nm-in input{-webkit-user-select:text;user-select:text;touch-action:manipulation;-webkit-appearance:none;appearance:none;outline:none;border:0;font-family:inherit;color:var(--ink)}
#tank .gl-in input{display:block;width:100%;height:44px;border-radius:14px;background:#fff;box-shadow:0 0 0 1px var(--line) inset;padding:0 52px 0 14px;font-size:var(--f2);font-weight:600;transition:box-shadow .2s}
#tank .gl-in input:focus{box-shadow:0 0 0 1.5px var(--ink) inset}
#tank .gl-in input::placeholder{color:var(--ink3);font-weight:500}
#tank .gl-in em{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-style:normal;font-size:11px;font-weight:700;color:var(--ink3);pointer-events:none}

/* 基因预感 */
#tank .gl-pre{flex:none;margin-top:10px;padding:8px 12px 10px;border-radius:16px;background:var(--bg2);box-shadow:0 0 0 1px var(--line) inset}
#tank .gl-risk{font-size:11.5px;font-weight:600;color:var(--ink3);white-space:nowrap;display:inline-flex;align-items:center;gap:4px}
#tank .gl-risk b{color:var(--ink);font-weight:800}
#tank .gl-meter{display:inline-block;width:40px;height:3px;border-radius:2px;background:#e8dccb;overflow:hidden;margin-left:4px}
#tank .gl-meter i{display:block;height:100%;border-radius:2px;background:linear-gradient(90deg,#9fb5c4,#c58b8b);transition:width .4s var(--ease)}
#tank .gl-hints{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
#tank .gl-hints li{position:relative;padding-left:12px;font-size:13px;line-height:1.5;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#tank .gl-hints li::before{content:'';position:absolute;left:2px;top:.66em;width:4px;height:4px;border-radius:50%;background:var(--ink3)}
#tank .gl-pre.upd .gl-hints li{animation:glFade .42s var(--ease) both}
#tank .gl-pre.upd .gl-hints li:nth-child(2){animation-delay:.05s}
#tank .gl-pre.upd .gl-hints li:nth-child(3){animation-delay:.1s}
#tank .gl-pre.upd .gl-hints li:nth-child(4){animation-delay:.15s}
@keyframes glFade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
#tank .gl-pre-e{font-size:var(--f1);font-weight:600;color:var(--ink3);padding:2px 0 2px}

/* 底部 */
#tank .gl-foot{flex:none;margin-top:10px}
#tank .gl-warn{font-size:var(--f1);font-weight:600;color:var(--ink2);line-height:1.5;text-align:center;margin:0 4px 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-wrap:balance}

/* 小屏：整页滚动，选择器给固定高度 */
@media (max-height:740px){
  #tank #tkLab{overflow-y:auto}
  #tank .gl-pick{flex:none;min-height:0}
  #tank .gl-scroll{flex:none;max-height:150px}
  #tank .gl-th{height:42px}
  #tank .gl-foot{position:sticky;bottom:-14px;background:var(--bg);padding:8px 0 4px;margin-bottom:-4px}
}

/* 卵卡：来源 */
#tank .eg-src{display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px;margin-top:10px;font-size:var(--f1);font-weight:600;color:var(--ink2)}
#tank .eg-src i{font-style:normal;color:var(--ink3)}

/* 鱼卡：中性性状标签 / 指纹 */
#tank .gl-chips span{color:var(--ink);background:#fff;box-shadow:0 0 0 1px var(--line) inset;font-weight:600;padding:3px 10px}
#tank .gl-chips.c{justify-content:center}
#tank .pl-fp{letter-spacing:.06em;color:var(--ink)}

/* 揭晓卡 + 命名 */
#tank .rv-card.gl-rv{width:min(352px,92%);padding:18px 18px 16px;text-align:center}
#tank .gl-rv-nm{font-size:var(--f4);font-weight:800;line-height:1.25;margin-top:6px;text-wrap:balance;color:var(--ink)}
#tank .gl-fp{display:inline-flex;align-items:center;gap:8px;margin-top:6px;font-size:var(--f1);font-weight:600;color:var(--ink2)}
#tank .gl-fp .num{letter-spacing:.08em;color:var(--ink);font-weight:700}
#tank .gl-fp i{width:3px;height:3px;border-radius:50%;background:var(--ink3)}
#tank .gl-lin{margin-top:14px;padding:12px 8px 10px;border-radius:18px;background:var(--bg2);box-shadow:0 0 0 1px var(--line) inset}
#tank .gl-lin-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:end;gap:6px}
#tank .gl-lin .ln{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
#tank .gl-lin .ln img{width:72px;height:46px;object-fit:contain;border-radius:12px;background:#fff;box-shadow:0 0 0 1px var(--line) inset}
#tank .gl-lin .ln img:not(.ok){opacity:.3}
#tank .gl-lin .ln span{font-size:var(--f1);font-weight:600;color:var(--ink2);max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#tank .gl-lin .ln.it .gl-ico{width:46px;height:46px;font-size:22px}
#tank .gl-lin-svg{display:block;width:100%;height:30px;margin-top:4px;overflow:visible}
#tank .gl-lin-svg path{fill:none;stroke:#c9bba8;stroke-width:1;vector-effect:non-scaling-stroke;stroke-dasharray:240;stroke-dashoffset:240;animation:glDraw .9s var(--ease) .25s forwards}
#tank .gl-lin-svg path.it{stroke-dasharray:3 3;stroke-dashoffset:0;animation:glFade .6s var(--ease) .5s both}
@keyframes glDraw{to{stroke-dashoffset:0}}
#tank .gl-lin-new{display:flex;flex-direction:column;align-items:center;gap:6px;margin-top:2px}
#tank .gl-lin-new i{width:9px;height:9px;border-radius:50%;background:var(--pri);box-shadow:0 0 0 4px rgba(255,122,138,.16);animation:glFade .5s var(--ease) 1s both}
#tank .gl-lin-new span{font-size:var(--f1);font-weight:600;color:var(--ink2)}
#tank .gl-rv .gl-chips{margin-top:12px}
#tank .gl-rv .tk-btn.main{margin-top:14px}
#tank .gl-nm-t{font-size:20px;font-weight:800;margin-top:4px;color:var(--ink)}
#tank .gl-nm-s{font-size:var(--f1);font-weight:600;color:var(--ink2);margin-top:4px}
#tank .gl-nm-in{display:flex;gap:8px;margin-top:16px}
#tank .gl-nm-in input{flex:1;min-width:0;height:52px;border-radius:16px;background:#fff;box-shadow:0 0 0 1.5px var(--ink) inset;padding:0 12px;font-size:var(--f3);font-weight:800;text-align:center}
#tank .gl-nm-in input.roll{animation:glRoll .34s var(--ease)}
@keyframes glRoll{0%{opacity:.2;transform:translateY(6px)}100%{opacity:1;transform:none}}
#tank #nmDice{flex:none;height:52px;padding:0 12px;border:0;border-radius:16px;background:var(--bg2);box-shadow:0 0 0 1px var(--line) inset;display:flex;align-items:center;gap:5px;font-family:inherit;font-size:var(--f1);font-weight:700;color:var(--ink2)}
#tank #nmDice svg.i{width:17px;height:17px;stroke-width:1.8}
#tank #nmDice:active{transform:scale(.96)}
#tank .gl-nm-meta{display:flex;justify-content:space-between;margin:8px 4px 0;font-size:11.5px;font-weight:600;color:var(--ink3);letter-spacing:.04em}
#tank .gl-name .tk-btn.main{margin-top:14px}

/* 串门：送鱼 / 偷鱼 */
#tank .ow-acts{display:none}
#tank.visiting .tk-own{max-height:none}
#tank.visiting .ow-acts{display:grid;grid-template-columns:1fr 1.3fr;gap:8px;margin-top:8px}
#tank .va-b{height:44px;border:0;border-radius:14px;display:flex;align-items:center;justify-content:center;gap:6px;font-family:inherit;font-size:var(--f2);font-weight:800;color:var(--ink);background:#fff;box-shadow:0 0 0 1px var(--line) inset,0 2px 0 var(--edge);white-space:nowrap;min-width:0;transition:transform .3s var(--spring)}
#tank .va-b svg.i{width:18px;height:18px;stroke-width:2}
#tank .va-b:active{transform:translateY(2px);transition-duration:.06s}
#tank #vaGive{color:var(--pri-d)}
#tank .va-b em{font-style:normal;font-size:11px;font-weight:700;color:var(--ink3);margin-left:2px;padding-left:8px;border-left:1px solid var(--line);line-height:14px}
#tank .va-b.spent{color:var(--ink3);background:var(--bg2);box-shadow:0 0 0 1px var(--line) inset}
#tank .va-b.spent svg.i{opacity:.7}
#tank .va-b.spent:active{transform:none}
#tank .va-b.nope{animation:vaNope .36s ease-in-out}
@keyframes vaNope{20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
#tank .gv-sheet{display:flex;flex-direction:column;max-height:calc(100% - 78px - var(--st) - var(--sb))}
#tank .gv-sheet .gl-grid{margin-top:14px;overflow-y:auto;max-height:46vh;padding:2px;touch-action:pan-y}
#tank .gv-sheet .gl-foot{margin-top:12px}
#tank .st-ov{position:absolute;inset:0;z-index:7;pointer-events:auto;display:flex;flex-direction:column;align-items:center;padding-top:calc(24% + var(--st));background:radial-gradient(120% 80% at 50% 50%,rgba(8,18,28,0) 25%,rgba(8,18,28,.58) 100%);opacity:0;transition:opacity .35s var(--ease)}
#tank .st-ov.on{opacity:1}
#tank .st-ring{position:relative;width:54px;height:54px}
#tank .st-ring i{position:absolute;inset:0;border-radius:50%;border:1px solid rgba(255,255,255,.75);animation:stBeat .9s ease-out infinite}
#tank .st-ring i+i{animation-delay:.2s}
@keyframes stBeat{0%{transform:scale(.6);opacity:.95}100%{transform:scale(1.5);opacity:0}}
#tank .st-t{margin-top:14px;padding-left:.42em;font-size:13px;font-weight:600;letter-spacing:.42em;color:rgba(255,255,255,.9)}
#tank .st-ov.got .st-ring i{animation:none;opacity:0}
#tank .st-ov.got .st-t{color:#fff;letter-spacing:.6em;padding-left:.6em;transition:letter-spacing .5s var(--ease)}
#tank .st-got{position:absolute;left:50%;bottom:calc(168px + var(--sb));z-index:6;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:8px 16px 8px 8px;border-radius:18px;background:rgba(255,250,243,.97);box-shadow:var(--sh-l);white-space:nowrap;animation:popIn .45s var(--spring) both;transition:opacity .4s,transform .4s}
#tank .st-got img{width:58px;height:40px;object-fit:contain;border-radius:10px;background:var(--bg2)}
#tank .st-got b{display:block;font-size:var(--f2);font-weight:800;color:var(--ink)}
#tank .st-got span{display:block;font-size:var(--f1);font-weight:600;color:var(--ink2)}
#tank .st-got.out{opacity:0;transform:translate(-50%,8px)}

/* 动态：新增类型 */
.ib-it.synth{background:linear-gradient(90deg,#f5f2fb,#fff)}
.ib-it.steal .ic,.ib-it.npc .ic{background:#f3efe9}
.ib-it.gift .ic,.ib-it.thanks .ic{background:var(--pri-l)}
.ib-it.gift .ic .i,.ib-it.thanks .ic .i{color:var(--pri-d)}
`;
