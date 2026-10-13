"use client";

// Holds the journey state (invoice, assumptions, chosen plan, approval) so every screen shares it.
// Saved in this browser tab's session storage, so a refresh doesn't lose the founder's place.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Invoice } from "@/lib/data/invoice";
import { merchant } from "@/lib/data/merchant";
import { runEngine, type EngineInput, type EngineResult } from "@/lib/engine";
import { DEFAULT_JOURNEY, INPUT_KEYS, parseJourney, type JourneyState } from "@/lib/journey";

const KEY = "cga.journey.v1";
// The invoice page keeps its own saved form under this key. A fresh start clears it too.
const INVOICE_FORM_KEY = "cga.confirmedInvoice.v1";

type Patch = Partial<Omit<JourneyState, "invoice" | "notes">>;

interface JourneyContextValue {
  state: JourneyState;
  /** False until saved state has been read, so screens don't flash "no invoice" on refresh. */
  ready: boolean;
  /** The founder confirmed an invoice. Clears any chosen plan, because the numbers changed. */
  setInvoice: (invoice: Invoice, notes: string[]) => void;
  /** The invoice is being edited or replaced, so it is no longer confirmed. */
  clearInvoice: () => void;
  /** Change an assumption or a choice. Changing a number clears the chosen plan and any approval. */
  update: (patch: Patch) => void;
  /** Start again from a blank journey. */
  reset: () => void;
}

const JourneyContext = createContext<JourneyContextValue | null>(null);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<JourneyState>(DEFAULT_JOURNEY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = sessionStorage.getItem(KEY);
        if (raw) setState(parseJourney(JSON.parse(raw)));
      } catch {
        // Blocked or corrupted storage: start from the default.
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable (for example a private window). The journey still works until refresh.
    }
  }, [state, ready]);

  const setInvoice = useCallback((invoice: Invoice, notes: string[]) => {
    setState((prev) => ({ ...prev, invoice, notes, chosenView: null, planChoice: "recommended", cancelled: false, approved: false, paid: false }));
  }, []);

  const clearInvoice = useCallback(() => {
    setState((prev) =>
      prev.invoice === null && prev.chosenView === null
        ? prev
        : { ...prev, invoice: null, notes: [], chosenView: null, planChoice: "recommended", cancelled: false, approved: false, paid: false },
    );
  }, []);

  const update = useCallback((patch: Patch) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      const numbersChanged = INPUT_KEYS.some((k) => k in patch && patch[k] !== prev[k]);
      return numbersChanged ? { ...next, chosenView: null, planChoice: "recommended", cancelled: false, approved: false, paid: false } : next;
    });
  }, []);

  const reset = useCallback(() => {
    setState({ ...DEFAULT_JOURNEY });
    try {
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem(INVOICE_FORM_KEY);
    } catch {}
  }, []);

  const value = useMemo(
    () => ({ state, ready, setInvoice, clearInvoice, update, reset }),
    [state, ready, setInvoice, clearInvoice, update, reset],
  );
  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useJourney(): JourneyContextValue {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error("useJourney must be used inside JourneyProvider");
  return ctx;
}

/** The engine's input for the current state, or null before an invoice is confirmed. */
export function engineInputFor(state: JourneyState): EngineInput | null {
  if (!state.invoice) return null;
  return {
    merchant,
    invoice: state.invoice,
    salesDropPercent: state.salesDropPercent,
    cashElsewhere: state.cashElsewhere,
    overdraftRatePct: state.overdraftRatePct,
  };
}

/** Runs the engine for the current state. Reruns whenever an assumption changes. */
export function useJourneyEngine(): { input: EngineInput; result: EngineResult } | null {
  const { state } = useJourney();
  const { invoice, salesDropPercent, cashElsewhere, overdraftRatePct } = state;
  return useMemo(() => {
    const input = engineInputFor({ ...DEFAULT_JOURNEY, invoice, salesDropPercent, cashElsewhere, overdraftRatePct });
    return input ? { input, result: runEngine(input) } : null;
  }, [invoice, salesDropPercent, cashElsewhere, overdraftRatePct]);
}
