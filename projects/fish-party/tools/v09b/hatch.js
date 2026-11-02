const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const egg = G.meta.S.tank.find((x) => x.egg && x.kind === 'synth');
if (!egg) return 'no synth egg';
egg.start -= egg.dur * 1000;
for (let i = 0; i < 80 && G.tankUI.busy; i++) await sleep(250);
G.tankUI.debugHatch(egg.uid);
for (let i = 0; i < 200 && !document.querySelector('#tkReveal.show'); i++) await sleep(250);
await sleep(600);
return 'reveal=' + !!document.querySelector('#tkReveal.show') + ' ' + document.querySelector('#tkReveal').innerText.replace(/\s+/g, ' ').slice(0, 300);
