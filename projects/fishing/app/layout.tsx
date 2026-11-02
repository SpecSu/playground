import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '出海钓鱼 — 把好心情钓上来',
  description: '选个分身登上游艇，和朋友一起出海钓鱼。20 种海洋惊喜，实时收竿，收进你的海洋背包。',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 5,
  viewportFit: 'cover', themeColor: '#0c0d0f',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
