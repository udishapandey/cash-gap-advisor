// The three AI routes, with the AI itself mocked. Checks what each route validates, what it hands to the AI,
// and that nothing from a request is logged.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleInvoice } from "@/lib/data/invoice";
import { merchant } from "@/lib/data/merchant";
import { runEngine } from "@/lib/engine";
import { UNMAPPABLE_MESSAGE } from "@/lib/whatif";

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  explainPlan: vi.fn(),
  callScript: vi.fn(),
  interpretWhatIf: vi.fn(),
  summariseOutcome: vi.fn(),
}));
import { callScript, explainPlan, interpretWhatIf, summariseOutcome } from "@/lib/ai";
import { POST as explainRoute } from "./explain/route";
import { POST as scriptRoute } from "./call-script/route";
import { POST as whatIfRoute } from "./what-if/route";
import { POST as resultsRoute } from "./results-summary/route";
import { resultsFacts } from "@/lib/ai-facts";
import { computeOutcome, SIMULATED_OUTCOMES } from "@/lib/engine/outcome";

const state = { invoice: sampleInvoice, salesDropPercent: 30, cashElsewhere: 0, overdraftRatePct: 14 };
const post = (body: unknown, raw?: string) =>
  new Request("http://localhost/api/ai/x", { method: "POST", headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify(body) });
const outcome = { status: "verified", text: "ok", language: "en", mock: false, cached: false };

beforeEach(() => {
  vi.mocked(explainPlan).mockReset().mockResolvedValue(outcome as never);
  vi.mocked(callScript).mockReset().mockResolvedValue(outcome as never);
  vi.mocked(summariseOutcome).mockReset().mockResolvedValue(outcome as never);
  vi.mocked(interpretWhatIf).mockReset().mockResolvedValue({ status: "mapped", settings: { salesDropPercent: 25 }, trace: "t", mock: false, cached: false });
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/ai/explain", () => {
  it("reruns the engine on the server and gives the AI that result, not anything from the browser", async () => {
    const res = await explainRoute(post({ state, language: "en" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, outcome });
    const [result, language] = vi.mocked(explainPlan).mock.calls[0];
    const expected = runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: 30, cashElsewhere: 0, overdraftRatePct: 14 });
    expect(language).toBe("en");
    expect(result.views.rightSized.loan).toBe(expected.views.rightSized.loan);
    expect(result.recommendedView).toBe(expected.recommendedView);
  });

  it("uses the founder's bank rate and extra cash", async () => {
    await explainRoute(post({ state: { ...state, cashElsewhere: 150_000, overdraftRatePct: 20 }, language: "hi" }));
    const [result, language] = vi.mocked(explainPlan).mock.calls[0];
    expect(language).toBe("hi");
    expect(result.views.keepFull.options.find((o) => o.id === "bank_overdraft")?.annualisedPct).toBe(20);
    expect(result.views.keepFull.gap.scenarios.expected.cash.cashElsewhere).toBe(150_000);
  });

  it.each([
    ["an unknown language", { state, language: "fr" }],
    ["no invoice", { state: { ...state, invoice: undefined }, language: "en" }],
    ["a sales drop of 500%", { state: { ...state, salesDropPercent: 500 }, language: "en" }],
    ["a negative amount of cash", { state: { ...state, cashElsewhere: -1 }, language: "en" }],
    ["a missing language", { state }],
    ["an invoice with the wrong shape", { state: { ...state, invoice: { amount: "five lakh" } }, language: "en" }],
  ])("refuses %s with a 400, and never calls the AI", async (_n, body) => {
    const res = await explainRoute(post(body));
    expect(res.status).toBe(400);
    expect(vi.mocked(explainPlan)).not.toHaveBeenCalled();
  });

  it("refuses a body that isn't JSON, or is far too large", async () => {
    expect((await explainRoute(post(null, "not json"))).status).toBe(400);
    expect((await explainRoute(post(null, JSON.stringify({ pad: "x".repeat(25_000) })))).status).toBe(413);
  });

  it("is never cached by the browser", async () => {
    expect((await explainRoute(post({ state, language: "en" }))).headers.get("Cache-Control")).toBe("no-store");
  });

  it("logs only that it was unavailable and why, never the request", async () => {
    vi.mocked(explainPlan).mockResolvedValue({ ...outcome, status: "unavailable", reason: "ungrounded" } as never);
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await explainRoute(post({ state: { ...state, invoice: { ...sampleInvoice, supplier: "SECRET-SUPPLIER-NAME" } }, language: "en" }));
    const logged = spies.flatMap((s) => s.mock.calls).flat().map(String).join(" ");
    expect(logged).toContain("unavailable: ungrounded");
    expect(logged).not.toContain("SECRET-SUPPLIER-NAME");
  });
});

describe("POST /api/ai/call-script", () => {
  it("builds the script from the chosen plan's invoice and due-date plan, and the days asked for", async () => {
    const res = await scriptRoute(post({ state: { ...state, salesDropPercent: 0, extensionDays: 7 }, language: "en", view: "right_sized" }));
    expect(res.status).toBe(200);
    const [invoice, plan, language, extra] = vi.mocked(callScript).mock.calls[0];
    const expected = runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: 0, extensionDays: 7 }).views.rightSized;
    expect(invoice.amount).toBe(expected.invoice.amount);
    expect(plan.gap).toBe(expected.duePlan.gap);
    expect(language).toBe("en");
    expect(extra).toEqual({ extensionDays: 7, borrowingRemovedRupees: expected.askFirst.borrowingRemoved });
  });

  it("defaults to the plan the numbers favour and to 15 extra days", async () => {
    await scriptRoute(post({ state: { ...state, salesDropPercent: 30 }, language: "en" }));
    const [invoice, , , extra] = vi.mocked(callScript).mock.calls[0];
    const r = runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: 30 });
    expect(invoice.amount).toBe(r.recommended.invoice.amount);
    expect(extra.extensionDays).toBe(15);
  });

  it("refuses a bad request, an unknown plan, or 60 extra days", async () => {
    for (const body of [
      { state, language: "en", view: "everything" },
      { state: { ...state, extensionDays: 60 }, language: "en" },
      { state, language: "klingon" },
    ]) {
      expect((await scriptRoute(post(body))).status).toBe(400);
    }
    expect(vi.mocked(callScript)).not.toHaveBeenCalled();
  });

  it("only returns text: nothing is sent to the supplier", async () => {
    const body = await (await scriptRoute(post({ state, language: "en" }))).json();
    expect(Object.keys(body).sort()).toEqual(["ok", "outcome"]);
  });
});

describe("POST /api/ai/what-if", () => {
  it("passes the question to the AI and returns what it understood", async () => {
    const res = await whatIfRoute(post({ question: "What if sales drop 25%?" }));
    expect(vi.mocked(interpretWhatIf)).toHaveBeenCalledWith("What if sales drop 25%?");
    expect(await res.json()).toMatchObject({ ok: true, outcome: { status: "mapped", settings: { salesDropPercent: 25 } } });
  });

  it("answers an empty question, or a very long one, with the fallback message and no AI call", async () => {
    for (const question of ["   ", "x".repeat(301)]) {
      const body = await (await whatIfRoute(post({ question }))).json();
      expect(body).toMatchObject({ ok: true, outcome: { status: "unmappable", message: UNMAPPABLE_MESSAGE } });
    }
    expect(vi.mocked(interpretWhatIf)).not.toHaveBeenCalled();
  });

  it("refuses a body that isn't JSON", async () => {
    expect((await whatIfRoute(post(null, "{"))).status).toBe(400);
  });

  it("never logs the question", async () => {
    vi.mocked(interpretWhatIf).mockResolvedValue({ status: "error", message: "x" });
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await whatIfRoute(post({ question: "my secret question about sales" }));
    expect(spies.flatMap((s) => s.mock.calls).flat().map(String).join(" ")).not.toContain("secret question");
  });
});

describe("POST /api/ai/results-summary", () => {
  const body = { state, view: "right_sized", outcome: "lower_15", language: "en" };

  it("reruns the engine and the outcome on the server, and gives the AI only the outcome's facts", async () => {
    const res = await resultsRoute(post(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, outcome });
    const [facts, language] = vi.mocked(summariseOutcome).mock.calls[0];
    const r = runEngine({ merchant, invoice: sampleInvoice, salesDropPercent: 30, cashElsewhere: 0, overdraftRatePct: 14 });
    const expected = resultsFacts(
      computeOutcome({ approved: r.views.rightSized, fullOrder: r.views.keepFull, stock: r.stock, merchant, salesDropPercent: 30, cashElsewhere: 0, actual: SIMULATED_OUTCOMES.lower_15 }),
    );
    expect(language).toBe("en");
    expect(facts).toEqual(expected);
    expect(facts.salesDirection).toBe("below");
  });

  it("uses the plan that was approved, not the one the numbers favour", async () => {
    await resultsRoute(post({ ...body, view: "keep_full" }));
    const [facts] = vi.mocked(summariseOutcome).mock.calls[0];
    expect(facts.pairsOrdered).toBe(sampleInvoice.units);
  });

  it.each([
    ["no plan", { ...body, view: undefined }],
    ["an unknown plan", { ...body, view: "both" }],
    ["an unknown outcome", { ...body, outcome: "much_higher" }],
    ["an unknown language", { ...body, language: "fr" }],
    ["no invoice", { ...body, state: { ...state, invoice: undefined } }],
  ])("refuses %s with a 400, and never calls the AI", async (_n, b) => {
    expect((await resultsRoute(post(b))).status).toBe(400);
    expect(vi.mocked(summariseOutcome)).not.toHaveBeenCalled();
  });

  it("refuses a body that isn't JSON or is far too large, and is never cached", async () => {
    expect((await resultsRoute(post(null, "nope"))).status).toBe(400);
    expect((await resultsRoute(post(null, JSON.stringify({ pad: "x".repeat(25_000) })))).status).toBe(413);
    expect((await resultsRoute(post(body))).headers.get("Cache-Control")).toBe("no-store");
  });

  it("logs only that it was unavailable and why, never the request", async () => {
    vi.mocked(summariseOutcome).mockResolvedValue({ ...outcome, status: "unavailable", reason: "ungrounded" } as never);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await resultsRoute(post(body));
    expect(err).toHaveBeenCalledWith("[ai/results-summary] unavailable: ungrounded");
    expect(JSON.stringify(err.mock.calls)).not.toContain(sampleInvoice.supplier);
  });
});
