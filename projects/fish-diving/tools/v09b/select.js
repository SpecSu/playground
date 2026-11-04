const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => document.querySelector('#tkLab ' + s);
q('[data-mate]').click(); await sleep(150);
q('[data-mode="item"]').click(); await sleep(150);
q('[data-item]:not([data-item=""])')?.click(); await sleep(150);
const inp = q('#glIn'); inp.value = '尾巴长成一把钥匙，带点深海冷色'; inp.dispatchEvent(new Event('input')); await sleep(500);
const lab = document.querySelector('#tkLab');
return 'go=' + !q('#glGo').disabled + ' hints=' + q('.gl-hints')?.textContent + ' sh=' + lab.scrollHeight + '/' + lab.clientHeight;
