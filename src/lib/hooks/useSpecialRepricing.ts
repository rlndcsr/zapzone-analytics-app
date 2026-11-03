import { useCallback, useEffect, useRef, useState } from "react";

import {
  quotePurchaseSpecial,
  type AppliedDiscount,
} from "../../services/pricingService";
import {
  REPRICING_FAILED,
  applySpecialTarget,
  hhmm,
  repricingNotice,
  sameVisit,
  visitChangeWhere,
  type SpecialEntryLike,
  type SwapMemo,
  type Visit,
} from "../pricing/specialPricing";
import { getToken } from "../session";

/** The web useSpecialRepricing debounce. */
const QUOTE_DEBOUNCE_MS = 300;

type Options<T extends SpecialEntryLike> = {
  entityType: "attraction" | "event";
  purchaseId: number | null;
  ready: boolean;
  isOrderLine: boolean;
  original: Visit;
  current: Visit;
  originalSpecial: readonly T[];
  applied: readonly T[];
  setApplied: (list: T[]) => void;
  discountAmount: number;
  setDiscountAmount: (value: number) => void;
  fromEntry: (entry: AppliedDiscount) => T;
  dateWord: string;
};

type Answer = { key: string; failed: boolean; notice: string | null };

export function useSpecialRepricing<T extends SpecialEntryLike>(
  options: Options<T>,
) {
  const latest = useRef(options);
  latest.current = options;
  const memo = useRef<SwapMemo>({ raw: null, lastSet: null });
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);

  const {
    ready,
    purchaseId,
    isOrderLine,
    entityType,
    dateWord,
    original,
    current,
  } = options;
  const same = sameVisit(original, current);
  const wantKey =
    ready && purchaseId && current.entityId && current.date
      ? [
          entityType,
          purchaseId,
          current.entityId,
          current.date,
          hhmm(current.time),
          current.quantity,
          attempt,
        ].join("|")
      : "";

  useEffect(() => {
    if (!wantKey) return;

    const apply = (target: T[]) => {
      const o = latest.current;
      const next = applySpecialTarget(
        o.applied,
        o.discountAmount,
        target,
        memo.current,
      );
      if (!next) return;
      memo.current = next.memo;
      o.setApplied(next.applied);
      o.setDiscountAmount(next.discountAmount);
    };

    if (same) {
      if (!isOrderLine) apply([...latest.current.originalSpecial]);
      return;
    }

    const token = getToken();
    if (!token) {
      setAnswer({ key: wantKey, failed: true, notice: REPRICING_FAILED });
      return;
    }

    const { current: cur, original: orig } = latest.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const quote = await quotePurchaseSpecial(
          token,
          entityType,
          purchaseId as number,
          entityType === "attraction"
            ? {
                attraction_id: cur.entityId,
                quantity: cur.quantity,
                scheduled_date: cur.date,
                scheduled_time: hhmm(cur.time) || null,
              }
            : {
                quantity: cur.quantity,
                purchase_date: cur.date,
                purchase_time: hhmm(cur.time) || null,
              },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (!quote) {
          setAnswer({ key: wantKey, failed: false, notice: null });
          return;
        }
        const target = quote.specialDiscounts.map((e) =>
          latest.current.fromEntry(e),
        );
        if (!isOrderLine) apply(target);
        setAnswer({
          key: wantKey,
          failed: false,
          notice: repricingNotice({
            quote,
            isOrderLine,
            where: visitChangeWhere(orig, cur, dateWord),
            originalSpecial: latest.current.originalSpecial,
          }),
        });
      } catch {
        if (controller.signal.aborted) return;
        setAnswer({ key: wantKey, failed: true, notice: REPRICING_FAILED });
      }
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [wantKey, same, isOrderLine, entityType, purchaseId, dateWord]);

  const answered = !!answer && answer.key === wantKey;
  const pending = !!wantKey && !same;
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    notice: pending && answered ? answer.notice : null,
    checking: pending && !answered && !isOrderLine,
    failed: pending && answered && answer.failed && !isOrderLine,
    retry,
  };
}
