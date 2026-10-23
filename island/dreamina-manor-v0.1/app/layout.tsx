import type { Metadata } from "next";
import "./globals.css";

export const viewport = {width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#72A8AA'};

export const metadata: Metadata = {
  title: "即梦庄园",
  description: "种下一颗小小的期待。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
