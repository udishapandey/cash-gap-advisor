import type { Metadata } from "next";
import ApproveScreen from "@/components/ApproveScreen";

export const metadata: Metadata = { title: "Approve | Cash Gap Advisor" };

export default function ApprovePage() {
  return <ApproveScreen />;
}
