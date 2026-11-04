const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
document.querySelector('#tkLab #glGo').click();
for (let i = 0; i < 120 && (G.tankUI.busy || !document.querySelector("#tkCard.show")); i++) await sleep(250);
await sleep(800);
return 'egg=' + !!G.meta.S.tank.find((x) => x.egg && x.kind === 'synth') + ' card=' + document.querySelector('#tkCard').innerText.replace(/\s+/g, ' ').slice(0, 200);
