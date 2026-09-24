import { useEffect, useRef, useState } from 'react';
import { useIsPhone } from './gestures';
import { haptic } from './haptics';

/**
 * Modal container that behaves like a native bottom sheet on phones —
 * drag the grabber (or the header) down to dismiss, with a rubber-band
 * feel and a velocity-aware flick threshold. On desktop it is a normal
 * centred dialog.
 */
export default function Sheet({
  children,
  onClose,
  maxWidth = 620,
  style,
  className = '',
  padded = true,
}: {
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: number;
  style?: React.CSSProperties;
  className?: string;
  /** Pad the content. Turn off when the caller supplies modal-head/body/foot. */
  padded?: boolean;
}) {
  const phone = useIsPhone();
  const [y, setY] = useState(0);
  const [closing, setClosing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; lastY: number; lastT: number; v: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  function dismiss() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, phone ? 220 : 0);
  }

  const onDown = (e: React.PointerEvent) => {
    if (!phone) return;
    // don't hijack drags that start on a control
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, button, a, .no-drag')) return;
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: performance.now(), v: 0 };
    setDragging(true);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.startY;
    const now = performance.now();
    const dt = Math.max(1, now - drag.current.lastT);
    drag.current.v = (e.clientY - drag.current.lastY) / dt;
    drag.current.lastY = e.clientY;
    drag.current.lastT = now;
    // rubber-band when pulled upward
    setY(dy < 0 ? dy * 0.24 : dy);
  };

  const onUp = () => {
    if (!drag.current) return;
    const h = sheetRef.current?.offsetHeight || 500;
    const flick = drag.current.v > 0.55;
    const far = y > h * 0.32;
    drag.current = null;
    setDragging(false);
    if (flick || far) {
      haptic.tap();
      dismiss();
    } else {
      setY(0);
    }
  };

  return (
    <div
      className={'overlay' + (closing ? ' closing' : '')}
      onMouseDown={(e) => e.target === e.currentTarget && dismiss()}
    >
      <div
        ref={sheetRef}
        className={`modal ${padded ? 'modal-padded' : ''} ${className} ${dragging ? 'dragging' : ''} ${closing ? 'closing' : ''}`}
        style={{
          maxWidth,
          transform: phone && y ? `translateY(${y}px)` : undefined,
          ...style,
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {phone && <div className="sheet-grabber" aria-hidden />}
        {children}
      </div>
    </div>
  );
}
