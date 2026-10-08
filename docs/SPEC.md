# Cash Gap Advisor — Specification

> **Status:** Draft. Written from the project name alone; items marked **[TBD]** need your input.

## 1. Overview

Cash Gap Advisor helps a business (or individual) detect and plan for **cash gaps**: periods where projected cash outflows exceed available cash and inflows. It forecasts the balance over time, flags upcoming shortfalls, and recommends actions to close them.

### Goals
- Forecast cash position over a configurable horizon (e.g. 13 weeks).
- Identify the date, size, and duration of each projected gap.
- Recommend concrete actions (delay payables, accelerate receivables, draw on credit, etc.).

### Non-goals
- Full accounting or bookkeeping.
- Executing payments or moving money.
- **[TBD]** Anything else out of scope for v1.

## 2. Users and Use Cases

| User | Need |
|------|------|
| **[TBD]** Owner / finance lead | See at a glance whether and when cash runs short |
| **[TBD]** Accountant / advisor | Run what-if scenarios and share recommendations |

Primary flows:
1. Import or enter opening balance, receivables, payables, and recurring items.
2. View projected balance timeline with gaps highlighted.
3. Review ranked recommendations and test their effect.
4. Export or share a report.

## 3. Functional Requirements

### 3.1 Data input
- **FR-1** Accept an opening cash balance and as-of date.
- **FR-2** Accept inflows (invoices/receivables) with amount, expected date, and optional payment-delay assumption.
- **FR-3** Accept outflows (bills/payables, payroll, taxes, loan payments) with amount and due date.
- **FR-4** Support recurring items (weekly, monthly, etc.).
- **FR-5** **[TBD]** Import via CSV and/or accounting integration (e.g. QuickBooks, Xero).

### 3.2 Forecasting
- **FR-6** Compute a daily/weekly projected balance across the horizon.
- **FR-7** Define a *cash gap* as any period where projected balance falls below a configurable minimum buffer (default 0).
- **FR-8** For each gap, report start date, end date, peak shortfall, and contributing items.

### 3.3 Recommendations
- **FR-9** Suggest actions to close each gap, with estimated impact on the balance.
- **FR-10** Recommendation types: defer payable, accelerate receivable/offer early-pay discount, use credit line, adjust recurring spend. **[TBD]**
- **FR-11** Show projected balance with and without a selected recommendation (what-if).

### 3.4 Reporting
- **FR-12** Timeline chart of balance with gaps shaded.
- **FR-13** Summary table of gaps and recommended actions.
- **FR-14** Export as PDF and/or CSV. **[TBD]**

## 4. Non-Functional Requirements

- **Accuracy:** Forecast math must be deterministic and reproducible for the same inputs.
- **Performance:** Recompute forecast in under 1 second for up to ~10,000 line items. **[TBD]**
- **Privacy/Security:** Financial data is sensitive; encrypted in transit and at rest; no data shared with third parties without consent. **[TBD]**
- **Usability:** Usable without finance training; plain-language explanations of each gap.

## 5. Architecture (proposed)

**[TBD]** Stack not yet chosen. Suggested layers:

- **Domain/forecast engine** — pure functions: `items + opening balance -> balance series + gaps`.
- **Recommendation engine** — takes gaps and items, returns ranked actions with simulated impact.
- **Interface** — web UI and/or CLI/API **[TBD]**.
- **Storage** — **[TBD]** (local file, SQLite, hosted DB).

## 6. Data Model (draft)

```
CashItem
  id, type (inflow|outflow), label, amount, date,
  recurrence (none|weekly|monthly|...), confidence (0-1), category

Scenario
  id, name, opening_balance, as_of_date, min_buffer, horizon_days, items[]

Gap
  start_date, end_date, peak_shortfall, items_contributing[]

Recommendation
  id, gap_id, type, description, impact_amount, effective_date, feasibility
```

## 7. Milestones

1. **M1 — Engine:** data model, forecast, gap detection, with tests.
2. **M2 — Recommendations:** rule-based suggestions and what-if.
3. **M3 — Interface:** input, timeline view, report export.
4. **M4 — Integrations:** CSV import, accounting connectors. **[TBD]**

## 8. Open Questions

1. Who is the target user: small businesses, freelancers, or finance teams?
2. Web app, CLI, API, or library?
3. Are recommendations rule-based, or LLM-assisted?
4. Which data sources must be supported at launch?
5. Currency, tax, and multi-account handling in scope?
6. Success metrics for v1?
