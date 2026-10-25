import {DEMO_ISLANDS, isDemoUid} from './demo-catalogue.js';

const DAY = 86400000;
const BEIJING = 8 * 3600000;
// Display-only daily income bands, keyed by identity rather than catalogue order.
// Weekly bands are higher than every possible daily amount for the same NPC.
const TIERS = {
  'demo-cat': {base: 120, spread: 80},
  'demo-frog': {base: 420, spread: 160},
  'demo-kelly': {base: 1250, spread: 400},
  'demo-bear': {base: 3600, spread: 900},
};

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

/** Fictional display amounts only. Unknown/player UIDs never receive an amount. */
export function simulatedIncomeForNpc(uid, now = Date.now()) {
  if (!Object.hasOwn(TIERS, uid)) return null;
  const {base, spread} = TIERS[uid];
  const dayStart = Math.floor((now + BEIJING) / DAY) * DAY - BEIJING;
  const weekday = new Date(dayStart + BEIJING).getUTCDay();
  const weekStart = dayStart - ((weekday + 6) % 7) * DAY;
  return {
    day: base + hash(`${uid}:day:${dayStart}`) % spread,
    week: base * 5 + hash(`${uid}:week:${weekStart}`) % (spread * 3),
  };
}

/**
 * Merge server income rows with four clearly marked fictional NPCs for display.
 * Real amounts are unchanged; only display rank and simulated flag are assigned.
 * This module never reads or writes player state, income records, or balances.
 */
export function mergeIncomeRankingRows(realRows = [], period = 'day', now = Date.now()) {
  const key = period === 'week' ? 'week' : 'day';
  const rows = realRows.filter(row => !isDemoUid(row.uid)).map(row => ({...row, simulated: false}));
  for (const npc of DEMO_ISLANDS) {
    rows.push({
      uid: npc.uid,
      profile: {name: npc.name, avatar: npc.avatar},
      theme: npc.theme,
      registered: true,
      self: false,
      simulated: true,
      income: simulatedIncomeForNpc(npc.uid, now)[key],
    });
  }
  rows.sort((a, b) => b.income - a.income || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  return rows.map((row, index) => ({...row, rank: index + 1}));
}
