// The visual style uses design tokens from Razorpay's open-source Blade design system (MIT, @razorpay/blade). This test
// checks that every token value in app/globals.css is the value in the installed package (nothing guessed), that no hex
// colour has crept in, and that the Razorpay logo and wordmark are not used.

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bladeTheme } from "@razorpay/blade/tokens";

const css = readFileSync("app/globals.css", "utf8");
const dark = bladeTheme.colors.onDark;
const light = bladeTheme.colors.onLight;
const desktop = bladeTheme.typography.onDesktop;

/** The value of a CSS custom property declared in globals.css (the text between the colon and the semicolon). */
function cssVar(name: string): string {
  const m = new RegExp(`${name.replace(/[-]/g, "\\-")}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`${name} is not declared in app/globals.css`);
  return m[1].trim().replace(/\s+/g, " ");
}
const at = (root: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], root);
const px = (n: number) => `${n}px`;

// CSS variable -> where its value lives in Blade.
const COLOURS: [string, unknown, string][] = [
  ["--background", light, "surface.background.gray.subtle"],
  ["--card", light, "surface.background.gray.intense"],
  ["--foreground", light, "surface.text.gray.normal"],
  ["--text-subtle", light, "surface.text.gray.subtle"],
  ["--muted", light, "surface.text.gray.muted"],
  ["--line", light, "surface.border.gray.subtle"],
  ["--line-strong", light, "surface.border.gray.normal"],
  ["--brand", light, "interactive.background.primary.default"],
  ["--brand-hover", light, "interactive.background.primary.highlighted"],
  ["--brand-faded", light, "interactive.background.primary.faded"],
  ["--brand-border", light, "interactive.border.primary.faded"],
  ["--brand-text", light, "interactive.text.primary.normal"],
  ["--positive-bg", light, "feedback.background.positive.subtle"],
  ["--positive-bg-intense", light, "feedback.background.positive.intense"],
  ["--positive-border", light, "feedback.border.positive.subtle"],
  ["--positive-text", light, "feedback.text.positive.intense"],
  ["--negative-bg", light, "feedback.background.negative.subtle"],
  ["--negative-bg-intense", light, "feedback.background.negative.intense"],
  ["--negative-border", light, "feedback.border.negative.subtle"],
  ["--negative-text", light, "feedback.text.negative.intense"],
  ["--notice-bg", light, "feedback.background.notice.subtle"],
  ["--notice-bg-intense", light, "feedback.background.notice.intense"],
  ["--notice-border", light, "feedback.border.notice.subtle"],
  ["--notice-text", light, "feedback.text.notice.intense"],
  ["--information-bg", light, "feedback.background.information.subtle"],
  ["--information-bg-intense", light, "feedback.background.information.intense"],
  ["--information-border", light, "feedback.border.information.subtle"],
  ["--information-text", light, "feedback.text.information.intense"],
  ["--neutral-bg", light, "feedback.background.neutral.subtle"],
  ["--neutral-bg-faded", light, "interactive.background.gray.default"],
  ["--navy", dark, "surface.background.gray.subtle"],
];

describe("design tokens come from Razorpay's Blade design system", () => {
  it("is MIT licensed, as the README and ASSUMPTIONS say", () => {
    const pkg = JSON.parse(readFileSync("node_modules/@razorpay/blade/package.json", "utf8"));
    expect(pkg.license).toBe("MIT");
  });

  it.each(COLOURS)("%s is Blade's colors %#s", (name, root, path) => {
    expect(cssVar(name)).toBe(String(at(root, path)));
  });

  it("the shadow is Blade's low elevation for light themes", () => {
    expect(cssVar("--elevation-low")).toBe(bladeTheme.elevation.onLight.lowRaised);
  });

  it("the font sizes and line heights are Blade's", () => {
    const sizes: Record<string, string> = { xs: "75", sm: "100", base: "200", lg: "300", xl: "400", "2xl": "500", "3xl": "600", "4xl": "700" };
    const family = desktop.fonts.size as Record<string, number>;
    const heights = desktop.lineHeights as Record<string, number>;
    for (const [name, key] of Object.entries(sizes)) {
      expect(cssVar(`--text-${name}`), `--text-${name}`).toBe(px(family[key]));
      expect(cssVar(`--text-${name}--line-height`), `--text-${name} line height`).toBe(px(heights[key]));
    }
  });

  it("the radii are Blade's small (8px) and medium (12px)", () => {
    expect(cssVar("--radius-md")).toBe(px(bladeTheme.border.radius.small));
    expect(cssVar("--radius-lg")).toBe(px(bladeTheme.border.radius.small));
    expect(cssVar("--radius-xl")).toBe(px(bladeTheme.border.radius.medium));
  });

  it("the font families are Blade's: Inter for text, TASA Orbiter for headings, Menlo for code", () => {
    expect(desktop.fonts.family.text).toContain("Inter");
    expect(desktop.fonts.family.heading).toContain("TASA Orbiter");
    expect(cssVar("--font-mono")).toContain("Menlo");
    expect(css).toContain("--font-inter");
    expect(css).toContain("--font-tasa-orbiter");
  });

  it("both of Blade's fonts are free on Google Fonts, so the app loads them with next/font and needs no fallback font", () => {
    const fonts = JSON.parse(readFileSync("node_modules/next/dist/compiled/@next/font/dist/google/font-data.json", "utf8"));
    expect(fonts["Inter"]).toBeDefined();
    expect(fonts["TASA Orbiter"]).toBeDefined();
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain('Inter, TASA_Orbiter } from "next/font/google"');
    expect(layout).not.toMatch(/Geist/);
  });

  it("has no hex colour in the stylesheet: every colour is a Blade token value", () => {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("every colour shade the screens use is mapped to a Blade feedback token, not left at Tailwind's default", () => {
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) {
          for (const m of readFileSync(p, "utf8").matchAll(/\b(?:bg|text|border|divide|ring|from|to)(?:-l)?-(green|red|amber|purple|blue|slate|gray|orange|yellow|emerald|sky|indigo)-(\d+)/g)) used.add(`${m[1]}-${m[2]}`);
        }
      }
    };
    walk("components");
    walk("app");
    const missing = [...used].filter((c) => !new RegExp(`--color-${c}:`).test(css));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(10);
  });
});

describe("no Razorpay logo or wordmark", () => {
  it("has no Razorpay image in public/", () => {
    const files = readdirSync("public", { recursive: true }).map(String);
    expect(files.filter((f) => /razorpay/i.test(f))).toEqual([]);
    expect(files.filter((f) => /logo/i.test(f))).toEqual([]);
  });

  it("keeps the prototype footer, and shows no Razorpay wordmark in the sidebar or header", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain("Concept prototype for the Razorpay x ISB challenge");
    expect(layout).not.toMatch(/<img|next\/image|<Image/);
    // The only mentions of the name in the layout are the footer and the page description.
    const mentions = layout.split("\n").filter((l) => /razorpay/i.test(l));
    expect(mentions).toHaveLength(2);
  });

  it("the sidebar name is the product's own, 'Cash Gap Advisor'", () => {
    expect(readFileSync("app/layout.tsx", "utf8")).toContain("Cash Gap Advisor");
  });
});
