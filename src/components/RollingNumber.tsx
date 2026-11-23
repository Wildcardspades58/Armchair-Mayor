// ============================================================================
// GOVERNOR — Phase 2: Smooth Rolling Number Counter (Ease-Out Spring Feel)
// Animates numeric transitions for Treasury Reserves and Overall Approval %.
// ============================================================================

import React, { useEffect, useRef, useState } from "react";

export interface RollingNumberProps {
  value: number;
  durationMs?: number;
  format: (val: number) => string;
  className?: string;
}

export const RollingNumber: React.FC<RollingNumberProps> = ({
  value,
  durationMs = 520,
  format,
  className,
}) => {
  const [displayValue, setDisplayValue] = useState<number>(value);
  const previousValueRef = useRef<number>(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const startVal = previousValueRef.current;
    const endVal = value;
    if (startVal === endVal) return;

    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - t, 3);
      const current = startVal + (endVal - startVal) * eased;
      setDisplayValue(current);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        previousValueRef.current = endVal;
        setDisplayValue(endVal);
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      previousValueRef.current = endVal;
    };
  }, [value, durationMs]);

  return <span className={className}>{format(displayValue)}</span>;
};
