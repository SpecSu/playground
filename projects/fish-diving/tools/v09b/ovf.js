// 溢出检查：可见面板内任何元素超出视口 / 横向溢出 / 文本被裁切
window.__ovf = (sel) => {
  const W = innerWidth, H = innerHeight, out = [];
  for (const root of document.querySelectorAll(sel)) {
    const rr = root.getBoundingClientRect();
    if (rr.bottom > H + 1 || rr.top < -1 || rr.right > W + 1 || rr.left < -1) out.push(`${root.id || root.className} rect ${Math.round(rr.left)},${Math.round(rr.top)},${Math.round(rr.right)},${Math.round(rr.bottom)}`);
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (r.right > rr.right + 1 || r.left < rr.left - 1) out.push(`x:${el.tagName}.${el.className} ${Math.round(r.left)}-${Math.round(r.right)}`);
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'visible' && !/ellipsis/.test(getComputedStyle(el).textOverflow) && el.tagName !== 'INPUT') out.push(`sw:${el.tagName}.${el.className} ${el.scrollWidth}/${el.clientWidth}`);
    }
  }
  return out.slice(0, 12).join(' ; ') || 'ok';
};
return 'ovf ready';
