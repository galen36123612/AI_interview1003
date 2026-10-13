import type { Metadata } from "next";
import "./globals.css";
import "./lib/envSetup";

export const metadata: Metadata = {
  title: "面試陪練｜學生與新鮮人 AI 面試教練",
  description:
    "用語音或文字練習自我介紹、論文與專案經驗。一次一題，逐層追問，得到具體回饋。",
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
