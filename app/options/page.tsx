import type { Metadata } from "next";
import OptionsScreen from "@/components/OptionsScreen";

export const metadata: Metadata = { title: "Options | Cash Gap Advisor" };

export default function OptionsPage() {
  return <OptionsScreen />;
}
