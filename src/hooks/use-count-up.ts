import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from its previous value up to `value` on mount / value change.
 * Falls back to the exact target if reduced-motion is on or rAF never runs
 * (headless capture, background tabs), so the number is always correct.
 */
export function useCountUp(value: number, durationMs = 900): number {
  const [display, setDisplay] = useState(0);
  const frame = useRef<number>(0);
  const startRef = useRef<number>(0);
  const fromRef = useRef<number>(0);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || !Number.isFinite(value)) {
      setDisplay(value);
      return;
    }

    fromRef.current = display;
    startRef.current = 0;

    const tick = (t: number) => {
      if (!startRef.current) startRef.current = t;
      const progress = Math.min((t - startRef.current) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(fromRef.current + (value - fromRef.current) * eased);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    // Safety net: guarantee the final value even if rAF is throttled/dead.
    const safety = setTimeout(() => setDisplay(value), durationMs + 200);
    return () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(safety);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return display;
}
