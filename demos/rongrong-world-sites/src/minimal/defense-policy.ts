/** Reversible product pause for the current Minimal farm only.
 * Historical fields/assets/receipts stay readable. Never use this as an auth gate
 * or delete a saved event: both authority and presentation simply leave it inert.
 */
export const MINIMAL_DEFENSE_ENABLED:boolean=false;
export const MINIMAL_DEFENSE_PAUSED_MESSAGE='守护与野兽来袭玩法已暂停，继续照顾小伙伴吧';
