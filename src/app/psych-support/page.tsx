import type { Metadata } from "next";
import PsychSupportClient from "./PsychSupportClient";

export const metadata: Metadata = {
  title: "心理支持 AI｜Realtime 研究預覽",
  description: "繁體中文心理支持 AI 的私人測試頁面。",
  robots: { index: false, follow: false },
};

export default function PsychSupportPage() {
  return <PsychSupportClient />;
}
