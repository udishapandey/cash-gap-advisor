# Build Log

One entry per day. Copy the template below, paste it under the latest entry, and fill it in.

## Template

### YYYY-MM-DD (Day N)

**What AI did**
-

**What went wrong**
-

**What I decided**
-

---

## 2026-10-10 (Day 1: Phase 0)

**What AI did**
- Scaffolded the Next.js + TypeScript app with a Razorpay-inspired dashboard look and the required footer.
- Wrote `CLAUDE.md` with the project rules.
- Wrote `lib/ai.ts` (Gemini default, Claude switchable via `AI_PROVIDER`) and the `/api/hello` route.
- Checked the free-tier Gemini Flash model name against Google's pricing page: `gemini-3.8-flash`.

**What went wrong**
- `docs/SPEC.md` was missing when Phase 0 started, so the spec summary in `CLAUDE.md` is a TODO.
- First test of `/api/hello` crashed: `export const dynamic` isn't allowed in this Next.js version (`cacheComponents` is on). Removed the line.

**What I decided**
-
