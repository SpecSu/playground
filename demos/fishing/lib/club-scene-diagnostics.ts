/** Public diagnostics use fixed codes only, never participant data or exception text. */
export type GraphicsFailureReason =
  | 'context-unavailable'
  | 'renderer-initialization'
  | 'scene-initialization'
  | 'viewport-initialization'
  | 'frame-error'
  | 'context-lost'
  | 'avatar-assets';

export type GraphicsState =
  | { status: 'initializing' | 'ready'; reason: null }
  | { status: 'failed'; reason: GraphicsFailureReason };

export function graphicsFailureMessage(reason: GraphicsFailureReason): { title: string; description: string } {
  if (reason === 'avatar-assets') return {
    title: '角色模型暂时加载失败',
    description: '舞者的 3D 模型未能载入，请重试。房间功能仍可使用。',
  };
  if (reason === 'context-unavailable') return {
    title: '暂时无法开启 3D 画面',
    description: '浏览器未能创建 WebGL2 画面，可重试或换一个浏览器。房间功能仍可使用。',
  };
  if (reason === 'context-lost') return {
    title: '3D 画面已暂停',
    description: '图形连接暂时中断，可重试恢复舞池。房间功能仍可使用。',
  };
  if (reason === 'frame-error') return {
    title: '舞池画面暂时中断',
    description: '3D 画面绘制遇到问题，请重试。房间功能仍可使用。',
  };
  return {
    title: '舞池画面加载遇到问题',
    description: '3D 场景初始化未完成，请重试。房间功能仍可使用。',
  };
}
