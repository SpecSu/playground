import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AFTERHOURS — 此刻派对',
  description: '一个小小的多人实时舞池。选个动物分身，和朋友一起听歌、跳舞、变换灯光，无需注册。',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 5,
  viewportFit: 'cover', themeColor: '#0c0d0f',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
