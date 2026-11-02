document.querySelector('#rvName').click();
await new Promise((r) => setTimeout(r, 500));
return document.querySelector('#tkReveal').innerText.replace(/\s+/g, ' ');
