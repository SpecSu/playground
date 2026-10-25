import{NPC_ISLAND_LAYOUTS}from'../art/npc-island-layouts.js';
/** Authored exhibitions, never online people or authenticated accounts. */
export const DEMO_ISLANDS=Object.freeze(NPC_ISLAND_LAYOUTS.map(d=>Object.freeze({uid:d.uid,name:d.profile.name,avatar:d.profile.avatar,theme:d.theme})));
export const isDemoUid=uid=>DEMO_ISLANDS.some(d=>d.uid===uid);
