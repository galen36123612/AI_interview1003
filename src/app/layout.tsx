import type { Metadata } from "next";
import "./globals.css";
import "./lib/envSetup";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "AI 心理支持｜Realtime 研究預覽",
  description:
    "用自然繁體中文，陪你整理情緒、需要、界線與下一步。研究測試，不取代真人心理師。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className={`antialiased`}>{children}</body>
    </html>
  );
}
