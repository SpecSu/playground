import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '火人节 · Dreamina Desert Ritual',
  description: '在无垠荒原创造艺术，与此刻在场的人一起漫游。五分钟后，见证作品燃烧、化为灰烬，再造一个梦。',
  icons: { icon: '/favicon.svg?v=fire-1', shortcut: '/favicon.svg?v=fire-1' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 5,
  viewportFit: 'cover', themeColor: '#0c0d0f',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
