import { useEffect, useState } from "react";

const STEPS = [10, 20, 50] as const;

/**
 * Rows per page for list screens.
 * - never fewer than 10
 * - on tall screens it grows with the available height, rounded to 10 / 20 / 50
 * - an explicit user choice (stored per list) always wins
 */
export function usePageSize(listKey: string, rowHeight = 44, reservedPx = 300) {
  const storageKey = `ans_page_size_${listKey}`;
  const read = (): number | null => {
    try {
      const v = Number(localStorage.getItem(storageKey));
      return STEPS.includes(v as (typeof STEPS)[number]) ? v : null;
    } catch {
      return null;
    }
  };
  const [userChoice, setUserChoice] = useState<number | null>(read);
  const auto = () => {
    const fit = Math.floor((window.innerHeight - reservedPx) / rowHeight);
    return fit >= 50 ? 50 : fit >= 20 ? 20 : 10;
  };
  const [autoSize, setAutoSize] = useState<number>(() => (typeof window === "undefined" ? 10 : auto()));

  useEffect(() => {
    const onResize = () => setAutoSize(auto());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowHeight, reservedPx]);

  const setPageSize = (size: number) => {
    setUserChoice(size);
    try {
      localStorage.setItem(storageKey, String(size));
    } catch {
      /* storage unavailable */
    }
  };

  return { pageSize: userChoice ?? autoSize, setPageSize, options: STEPS as readonly number[] };
}
