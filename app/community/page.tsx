import type { Metadata } from "next";
import { CommunityPage } from "@/components/community/CommunityPage";

export const metadata: Metadata = { title: "Сообщество" };

export default function Community() {
  return <CommunityPage />;
}
