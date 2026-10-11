import type { Metadata } from "next";
import ResultsScreen from "@/components/ResultsScreen";

export const metadata: Metadata = { title: "Results | Cash Gap Advisor" };

export default function ResultsPage() {
  return <ResultsScreen />;
}
