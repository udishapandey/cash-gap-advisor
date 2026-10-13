import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KFS_DISCLAIMER, KFS_LABEL, buildKfs } from "@/lib/journey";
import KeyFactStatementPanel from "./KeyFactStatement";

const html = renderToStaticMarkup(<KeyFactStatementPanel kfs={buildKfs(100_000, 30, 1_479)} />);

describe("Key Fact Statement panel", () => {
  it("labels the values 'Illustrative values' on screen", () => {
    expect(KFS_LABEL).toBe("Illustrative values");
    expect(html).toContain("Illustrative values");
  });

  it("says in words that they are placeholders, not a real offer", () => {
    expect(html).toContain(KFS_DISCLAIMER.replace("&", "&amp;"));
    expect(html).toContain("not a real offer");
  });

  it("puts the label at the top, next to the title, before any number", () => {
    expect(html.indexOf("Key Fact Statement")).toBeLessThan(html.indexOf("Illustrative values"));
    expect(html.indexOf("Illustrative values")).toBeLessThan(html.indexOf("Loan amount"));
  });

  it("still shows every fact the borrower must see", () => {
    for (const label of [
      "Partner NBFC (simulated)",
      "Loan amount",
      "Interest rate",
      "Total interest",
      "Fees",
      "Tenure",
      "Total repayable",
      "Repayment schedule",
      "bank account",
      "Grievance contact",
    ]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain("₹1,00,000");
    expect(html).toContain("₹1,01,479");
  });
});
