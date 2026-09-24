import { useEffect, useRef, useState } from 'react';

/** Long-press that survives small finger jitter but cancels on real scrolling. */
export function useLongPress(cb: () => void, ms = 460) {
  const timer = useRef<any>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = () => {
    clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };

  return {
    didFire: () => fired.current,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') return;
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          fired.current = true;
          cb();
        }, ms);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!start.current) return;
        if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 12) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
    },
  };
}

/** Tracks whether the viewport is phone-sized, reactively. */
export function useIsPhone() {
  const [phone, setPhone] = useState(
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 860px)').matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const on = (e: MediaQueryListEvent) => setPhone(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

/** Respect the OS "reduce motion" setting. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}
