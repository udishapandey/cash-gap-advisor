// The plain-language, answer-first layout: one banner instead of per-item "Simulated" badges, a minimal sidebar, English by
// default, and the working tucked into disclosures.

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_JOURNEY } from "@/lib/journey";
import Disclosure from "./Disclosure";
import { SimulatedTag } from "./ui";

const read = (p: string) => readFileSync(p, "utf8");

describe("one banner, no per-item Simulated badges", () => {
  it("the layout has the single banner, and the footer is kept", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("Concept prototype · all merchant data is simulated");
    expect(layout.split("all merchant data is simulated")).toHaveLength(2); // exactly once
    expect(layout).toContain("Concept prototype for the Razorpay x ISB challenge");
    expect(layout).not.toMatch(/Simulated data/); // the old header pill is gone
  });
  it("the old per-item badge renders nothing", () => {
    expect(renderToStaticMarkup(<SimulatedTag />)).toBe("");
    expect(renderToStaticMarkup(<SimulatedTag>Your input</SimulatedTag>)).toBe("");
  });
  it("no screen draws its own SIMULATED badge", () => {
    for (const f of ["app/page.tsx", "components/OptionsScreen.tsx", "components/ResultsScreen.tsx", "components/ApproveScreen.tsx", "components/GapScreen.tsx", "components/InvoiceFlow.tsx"]) {
      expect(read(f), f).not.toMatch(/uppercase[^"]*>\s*Simulated/);
    }
  });
});

describe("the sidebar", () => {
  it("is just the app name and Dashboard: no step list (the stepper at the top of each screen stays)", () => {
    const nav = read("components/NavLinks.tsx");
    expect(nav).toContain("Dashboard");
    expect(nav).not.toMatch(/STEPS|stepStatus|Decision journey/);
    expect(read("components/Stepper.tsx")).toContain("STEPS");
    expect(read("components/JourneyShell.tsx")).toContain("<Stepper");
  });
});

describe("language", () => {
  it("is English by default; Hindi stays a toggle", () => {
    expect(DEFAULT_JOURNEY.language).toBe("en");
  });
});

describe("the disclosure", () => {
  it("is closed by default and shows its title", () => {
    const html = renderToStaticMarkup(<Disclosure title="See how we worked this out">The working</Disclosure>);
    expect(html).toContain("<details");
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
    expect(html).toContain("See how we worked this out");
    expect(html).toContain("The working");
  });
  it("opens when asked to", () => {
    expect(renderToStaticMarkup(<Disclosure title="t" open>x</Disclosure>)).toMatch(/<details[^>]*\bopen=""/);
  });
  it("lazy keeps its content out of the page until it is opened (so an AI call inside never runs while it is closed)", () => {
    const closed = renderToStaticMarkup(<Disclosure title="Full AI explanation" lazy>SECRET CONTENT</Disclosure>);
    expect(closed).not.toContain("SECRET CONTENT");
    const open = renderToStaticMarkup(<Disclosure title="Full AI explanation" lazy open>SECRET CONTENT</Disclosure>);
    expect(open).toContain("SECRET CONTENT");
  });
});

describe("the screens answer first, with the proof in disclosures", () => {
  it("Options: a recommended-plan card, the supplier nudge, then three collapsed sections", () => {
    const o = read("components/OptionsScreen.tsx");
    expect(o.indexOf("<HeroCard")).toBeLessThan(o.indexOf("<SupplierNudge"));
    expect(o.indexOf("<SupplierNudge")).toBeLessThan(o.indexOf('title="Compare every option"'));
    for (const t of ['title="Compare every option"', 'title="What if sales are lower?"', 'title="Full AI explanation"']) expect(o).toContain(t);
    expect(o).toContain("Approve this plan");
    expect(o).toContain("Compare other ways");
    expect(o).toContain("Before you borrow: ask the supplier for more days");
  });
  it("Results: a hero line, three tiles, what I learned, and the working collapsed", () => {
    const r = read("components/ResultsScreen.tsx");
    for (const t of ["Money saved", "Borrowed more than needed", "Forecast accuracy", "What I learned", "See how we worked this out"]) expect(r).toContain(t);
    expect(r.indexOf("<Hero")).toBeLessThan(r.indexOf("<Tiles"));
    expect(r.indexOf("<Tiles")).toBeLessThan(r.indexOf("<Disclosure"));
  });
  it("Cash gap and Dashboard collapse their working", () => {
    expect(read("components/GapScreen.tsx")).toContain('<Disclosure title="See how we worked this out"');
    expect(read("app/page.tsx")).toContain('<Disclosure title="See how we worked this out"');
  });
  it("Invoice: the five things that matter first, the rest under More details", () => {
    const f = read("components/InvoiceFlow.tsx");
    expect(f).toContain("MAIN_FIELDS");
    expect(f).toContain('title="More details"');
  });
});

describe("plain labels on every screen", () => {
  it("no screen shows the old finance words as a label", () => {
    const screens = ["app/page.tsx", "components/OptionsScreen.tsx", "components/ResultsScreen.tsx", "components/ApproveScreen.tsx", "components/GapScreen.tsx", "components/StandbyLine.tsx"];
    for (const f of screens) {
      const text = read(f)
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && !/import /.test(l))
        .join("\n");
      expect(text, f).not.toMatch(/>\s*Peak shortfall|>\s*Standby|Total funding cost|Right-size order|>\s*Early settlement|>\s*Annualised/);
    }
  });
});
