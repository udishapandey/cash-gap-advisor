import type { Metadata } from "next";
import InvoiceFlow from "@/components/InvoiceFlow";

export const metadata: Metadata = {
  title: "Upload invoice | Cash Gap Advisor",
};

export default function InvoicePage() {
  return <InvoiceFlow />;
}
