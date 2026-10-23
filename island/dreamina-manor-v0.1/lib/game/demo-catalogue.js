/** Authored exhibitions, never online people or authenticated accounts. */
export const DEMO_ISLANDS=Object.freeze([{uid:'demo-kelly',name:'Kelly',avatar:'human-kelly'},{uid:'demo-bear',name:'Bear熊',avatar:'human-bear'}].map(d=>Object.freeze(d)));
export const isDemoUid=uid=>DEMO_ISLANDS.some(d=>d.uid===uid);
