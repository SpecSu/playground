import {GOLD_COIN_SVG} from './coin-reward.js';
const paths={
 invite:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M19 7v8M15 11h8"/>',
 'chevron-right':'<path d="m9 5 7 7-7 7"/>',
 seed:'<path d="M12 20v-8M12 14C5 15 3 9 4 5c5-1 9 2 8 7M12 11c0-5 4-8 9-7 0 5-3 9-9 9"/>',
 crystal:'<path d="m12 2 7 5 2 7-9 8-9-8 2-7Z"/><path d="m5 7 7 3 7-3M3 14h18M12 10v12M12 2 8 7l4 3 4-3-4-5"/>',
 hammer:'<path d="m14 4 6 6-3 3-3-3-9 10-3-3 10-9-2-2 4-2Z"/>',
 visit:'<path d="M3 11 12 3l9 8M5 10v10h14V10M9 20v-7h6v7"/><path d="M15 4h4v4"/>',
 bag:'<path d="M5 8h14l2 13H3L5 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2M8 13h8"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',back:'<path d="m15 5-7 7 7 7"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
 sound:'<path d="m4 9 5 0 5-4v14l-5-4H4V9ZM18 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14"/>',mute:'<path d="m4 9 5 0 5-4v14l-5-4H4V9ZM18 9l4 6m0-6-4 6"/>',
 center:'<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
 play:'<path d="m9 5 10 7-10 7V5Z"/>',sell:'<path d="M3 7h18l-2 14H5L3 7ZM2 7l3-5h14l3 5M9 11v5m6-5v5"/>',
 land:'<path d="m12 4 10 6-10 6L2 10l10-6Z"/><path d="M2 10v5l10 6 10-6v-5M12 16v5"/>',
 platform:'<path d="m12 4 10 6-10 6L2 10l10-6Z"/><path d="m6 8 10 6M10 5l10 6M2 10v5l10 6 10-6v-5M12 16v5"/>',
 fence:'<path d="M4 3v18M12 3v18M20 3v18M3 8h18M3 16h18"/>',
 wall:'<path d="M2 6h20v15H2V6ZM2 13h20M8 6v7m8-7v7M12 13v8"/>',
 move:'<path d="M12 2v20M2 12h20m-10-10-3 3m3-3 3 3M2 12l3-3m-3 3 3 3m7 7-3-3m3 3 3-3m7-7-3-3m3 3-3 3"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',check:'<path d="m5 12 4 4L20 5"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
 leaf:'<path d="M20 3C9 1 3 7 4 14s10 10 14 2c2-4 2-8 2-13ZM4 20 16 8"/>',home:'<path d="m3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7"/>',
};
export const icon=(name,cls='')=>name==='coin'?GOLD_COIN_SVG.replace('<svg ',`<svg class="icon ${cls}" `):`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]??paths.seed}</svg>`;
