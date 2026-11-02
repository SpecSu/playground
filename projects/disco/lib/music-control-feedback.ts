type MusicControlState = {
  changing: boolean;
  loading: boolean;
  error: string | null;
  needsGesture: boolean;
  pendingRoom: boolean;
  coolingDown: boolean;
};

/** Server confirmation and local audio readiness are separate, visible phases. */
export function musicControlFeedback(state: MusicControlState): { message: string | null; busy: boolean } {
  if (state.changing) return { message: '正在切换歌曲…', busy: true };
  if (state.loading) return { message: '歌曲已同步，正在准备声音…', busy: true };
  if (state.error) return { message: '声音加载失败，点声音按钮重试。', busy: false };
  if (state.needsGesture) return { message: '轻点任意操作即可开启音乐。', busy: false };
  if (state.pendingRoom) return { message: '正在同步房间…', busy: true };
  if (state.coolingDown) return { message: '稍等片刻即可再次切歌。', busy: false };
  return { message: null, busy: false };
}
