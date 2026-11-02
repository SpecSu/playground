/** This preference belongs only to this browser; it is not a server/account like. */
export const LIVE_WORK_LIKE_KEY = 'afterhours-live-work-liked-v1';

type LikeReader = Pick<Storage, 'getItem'>;
type LikeWriter = Pick<Storage, 'setItem'>;

export function readLiveWorkLiked(storage: LikeReader): boolean {
  try { return storage.getItem(LIVE_WORK_LIKE_KEY) === '1'; }
  catch { return false; }
}

/** Return false when the preference could not persist, so the UI can be honest. */
export function saveLiveWorkLiked(storage: LikeWriter, liked: boolean): boolean {
  try { storage.setItem(LIVE_WORK_LIKE_KEY, liked ? '1' : '0'); return true; }
  catch { return false; }
}
