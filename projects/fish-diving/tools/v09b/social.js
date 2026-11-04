const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
document.querySelector('#vaSteal').click();
for (let i = 0; i < 40 && !G.tankUI.busy; i++) await sleep(100);
for (let i = 0; i < 200 && G.tankUI.busy; i++) await sleep(200);
await sleep(300);
const after = document.querySelector('#tkVisitActs').innerText.replace(/\s+/g, ' ');
// 再偷一次：应被每日上限拦下
document.querySelector('#vaSteal').click(); await sleep(200);
const toast = document.querySelector('#tkToast').innerText.replace(/\s+/g, ' ');
// 送一条鱼
document.querySelector('#vaGive').click(); await sleep(300);
document.querySelector('#tkGive [data-gv]')?.click(); await sleep(150);
document.querySelector('#gvGo')?.click(); await sleep(600);
// NPC 事件强制触发：回赠 / 偷
for (const q of G.meta.S.npcQueue) q.due = Date.now() - 1;   // 回执提前到期
G.dbg.npcNow = 'gift';
for (let i = 0; i < 60 && G.dbg.npcNow; i++) await sleep(250);
await sleep(800);
document.querySelector('#tkBell').click(); await sleep(500);
return 'q=' + G.meta.S.npcQueue.length + ' npcDay=' + JSON.stringify(G.meta.S.npcDay) + ' dbg=' + G.dbg.npcNow + ' tank=' + G.meta.S.tank.length + ' stealLeft=' + G.meta.stealLeft() + ' acts=' + after + ' toast2=' + toast + ' inbox=' + G.meta.S.inbox.slice(0, 5).map((x) => x.kind + ':' + x.text).join(' | ');
