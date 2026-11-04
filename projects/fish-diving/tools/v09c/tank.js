// v0.9 C 水族箱尺寸截图：清空水族箱，放入一组从小到巨型的天然鱼，打开水族箱
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 4 && document.querySelector('#modal.show .btn-p'); i++) { document.querySelector('#modal.show .btn-p').click(); await sleep(500); }
if (G.tankUI.isOpen) { document.getElementById('tkBack').click(); await sleep(1500); }
if (G.player.state === 'hold') { G.keepCatch(); }
for (let i = 0; i < 80 && G.player.state !== 'idle'; i++) await sleep(250);
document.getElementById('catch')?.classList.remove('show');
const ids = (window.__tankIds || 'clownfish,blue-tang,seahorse,mackerel,salmon,tuna,orca,whale-shark').split(',');
const M = G.meta;
M.S.tank = [];
for (const id of ids) { const sp = G.SPECIES.find((s) => s.id === id); if (!sp) continue; const v = G.makeVariant(sp, 0); v.traits = []; M.addToTank(v); }
M.save();
G.openTank();
for (let i = 0; i < 240 && (G.tankUI.loading || !G.tankUI.isOpen); i++) await sleep(250);
await sleep(1200);
document.querySelector('.tk-tip button')?.click();
for (let i = 0; i < 4 && document.querySelector('#modal.show .btn-p'); i++) { document.querySelector('#modal.show .btn-p').click(); await sleep(500); }
await sleep(600);
return 'open=' + G.tankUI.isOpen + ' tank: ' + M.tankFish().map((v) => `${v.sp}:${v.cm}cm`).join(' ');
