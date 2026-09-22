import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, StickyNote, Link2, ImagePlus, Trash2, Copy, Share2, ZoomIn, ZoomOut,
  Maximize, Palette, Grid3x3, Type, CheckSquare, Square, Plus, X, Frame,
  Shapes, Pencil, Check, Eraser, Undo2, BringToFront, SendToBack,
  ChevronUp, ChevronDown, Image as ImageIcon, UserPlus,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight, Minus,
} from 'lucide-react';
import { api, uploadImage, CANVAS_PRESETS, type Board as BoardT, type BoardItem } from '../api';
import { useApp } from '../store';
import { STICKY_COLORS, hostOf } from '../colors';
import { haptic } from '../lib/haptics';
import Sheet from '../lib/Sheet';
import { useCollab, type Peer } from '../lib/collab';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'move'; id: number; sx: number; sy: number; ix: number; iy: number; moved: boolean }
  | { kind: 'resize'; id: number; sx: number; sy: number; iw: number; ih: number }
  | null;

export default function Board() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useApp();
  const [board, setBoard] = useState<BoardT | null>(null);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [drag, setDrag] = useState<Drag>(null);
  const [showColors, setShowColors] = useState(false);
  const [showCanvasCfg, setShowCanvasCfg] = useState(false);
  const [fresh, setFresh] = useState<number | null>(null);
  const [tool, setTool] = useState<'select' | 'draw' | 'erase'>('select');
  const [penColor, setPenColor] = useState('#e5326b');
  const [penWidth, setPenWidth] = useState(4);
  const [showShapes, setShowShapes] = useState(false);
  const [liveStroke, setLiveStroke] = useState<number[][] | null>(null);
  /** Mirror of liveStroke readable synchronously (state updates are deferred). */
  const liveStrokeRef = useRef<number[][] | null>(null);
  const strokes = useRef<{ pts: number[][]; c: string; w: number }[]>([]);
  const [erasing, setErasing] = useState(false);
  const [linkDlg, setLinkDlg] = useState(false);
  const [editLink, setEditLink] = useState<BoardItem | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [showPeople, setShowPeople] = useState(false);
  /** Strokes other people are drawing right now, keyed by their session id. */
  const [peerInk, setPeerInk] = useState<Record<string, { pts: number[][]; c: string; w: number }[]>>({});

  /* ---- live collaboration: apply changes made by other editors ---- */
  const applyRemote = useCallback((m: any) => {
    if (m.t === 'ink') {
      // Live stroke from another editor — shown until they commit it.
      setPeerInk((cur) => ({ ...cur, [m.sid]: m.strokes || [] }));
      return;
    }
    if (m.t === 'ink:end') {
      setPeerInk((cur) => { const n = { ...cur }; delete n[m.sid]; return n; });
      return;
    }
    if (m.t === 'item:add' && m.item) {
      setItems((cur) => (cur.some((c) => c.id === m.item.id) ? cur : [...cur, m.item]));
    } else if (m.t === 'item:update' && m.item) {
      setItems((cur) => cur.map((c) => (c.id === m.item.id ? { ...c, ...m.item } : c)));
    } else if (m.t === 'item:remove') {
      setItems((cur) => cur.filter((c) => c.id !== m.id));
    } else if (m.t === 'board:update' && m.patch) {
      setBoard((b) => (b ? { ...b, ...m.patch } : b));
    }
  }, []);
  const { peers, connected, send } = useCollab(board?.id, applyRemote);
  // Drop ink belonging to sessions that have gone.
  useEffect(() => {
    setPeerInk((cur) => {
      const live = new Set(peers.map((p) => p.sid));
      const next = Object.fromEntries(Object.entries(cur).filter(([sid]) => live.has(sid)));
      return Object.keys(next).length === Object.keys(cur).length ? cur : next;
    });
  }, [peers]);
  const sendRef = useRef<typeof send | null>(null);
  sendRef.current = send;
  const [eraseTick, setEraseTick] = useState(0);
  const [dropped, setDropped] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const canvasEl = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; k: number; cx: number; cy: number; vx: number; vy: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimers = useRef<Record<number, any>>({});

  useEffect(() => {
    api
      .get<BoardT>(`/boards/${id}`)
      .then((b) => { setBoard(b); setItems(b.items); })
      .catch((e) => { toast(e.message, 'err'); nav('/boards'); });
  }, [id]);

  const maxZ = () => items.reduce((m, i) => Math.max(m, i.z), 0);

  const toBoardCoords = (cx: number, cy: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  };

  const centerOfView = () => {
    const r = wrap.current!.getBoundingClientRect();
    return toBoardCoords(r.left + r.width / 2 - 110, r.top + r.height / 2 - 100);
  };

  const clampToCanvas = (x: number, y: number, w: number, h: number) => {
    if (!board || board.canvasMode !== 'fixed') return { x, y };
    return {
      x: Math.max(0, Math.min(board.canvasW - w, x)),
      y: Math.max(0, Math.min(board.canvasH - h, y)),
    };
  };

  const addItem = useCallback(
    async (partial: Partial<BoardItem>) => {
      const c = centerOfView();
      const body = {
        type: 'sticky',
        x: c.x + (Math.random() * 40 - 20),
        y: c.y + (Math.random() * 40 - 20),
        w: 220, h: 200, z: maxZ() + 1,
        rotation: Math.random() * 5 - 2.5,
        color: Object.keys(STICKY_COLORS)[Math.floor(Math.random() * 8)],
        data: {},
        ...partial,
      };
      const fit = clampToCanvas(body.x, body.y, body.w, body.h);
      body.x = fit.x;
      body.y = fit.y;
      const it = await api.post<BoardItem>(`/boards/${id}/items`, body);
      haptic.success();
      sendRef.current?.({ t: 'item:add', item: it });
      setItems((x) => [...x, it]);
      setSel(it.id);
      setFresh(it.id);
      setTimeout(() => setFresh((f) => (f === it.id ? null : f)), 450);
      return it;
    },
    [id, items, view]
  );

  const queueSave = (itemId: number, patch: Partial<BoardItem>) => {
    clearTimeout(saveTimers.current[itemId]);
    saveTimers.current[itemId] = setTimeout(() => {
      api.patch(`/boards/${id}/items/${itemId}`, patch).catch(() => {});
    }, 400);
  };

  const update = (itemId: number, patch: Partial<BoardItem>, save = true) => {
    setItems((x) => x.map((i) => (i.id === itemId ? { ...i, ...patch } : i)));
    sendRef.current?.({ t: 'item:update', item: { id: itemId, ...patch } });
    if (save) queueSave(itemId, patch);
  };

  const removeItem = async (itemId: number) => {
    haptic.warn();
    setItems((x) => x.filter((i) => i.id !== itemId));
    setSel(null);
    sendRef.current?.({ t: 'item:remove', id: itemId });
    await api.del(`/boards/${id}/items/${itemId}`).catch(() => {});
  };

  const duplicate = async (it: BoardItem) => {
    const copy = await api.post<BoardItem>(`/boards/${id}/items`, {
      ...it, x: it.x + 24, y: it.y + 24, z: maxZ() + 1,
    });
    sendRef.current?.({ t: 'item:add', item: copy });
    setItems((x) => [...x, copy]);
    setSel(copy.id);
  };

  /* ------------------------ pointer handling ------------------------ */
  const lastTap = useRef<{ t: number; x: number; y: number }>({ t: 0, x: 0, y: 0 });

  /** Collapse any live text selection so it can't fight with a drag. */
  const dropSelection = () => {
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed) {
      const a = document.activeElement;
      // Leave a field the user is genuinely editing alone.
      if (!(a instanceof HTMLTextAreaElement || a instanceof HTMLInputElement)) sel.removeAllRanges();
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // double-tap empty canvas on touch = drop a sticky there
    if (e.pointerType !== 'mouse' && e.target === e.currentTarget) {
      const now = performance.now();
      const near = Math.hypot(e.clientX - lastTap.current.x, e.clientY - lastTap.current.y) < 34;
      if (now - lastTap.current.t < 320 && near) {
        const p = toBoardCoords(e.clientX, e.clientY);
        addItem({ type: 'sticky', x: p.x - 102, y: p.y - 92, data: { text: '' } });
        lastTap.current = { t: 0, x: 0, y: 0 };
        return;
      }
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = wrap.current!.getBoundingClientRect();
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        k: view.k,
        cx: (a.x + b.x) / 2 - r.left,
        cy: (a.y + b.y) / 2 - r.top,
        vx: view.x,
        vy: view.y,
      };
      setDrag(null);
      return;
    }
    // Background = anything that isn't an item. On a fixed board the page
    // rectangle sits above the canvas, so target !== currentTarget there.
    // Eraser: rub out strokes from the working sketch and delete drawn items.
    if (tool === 'erase') {
      const p = toBoardCoords(e.clientX, e.clientY);
      eraseAt(p.x, p.y);
      setErasing(true);
      capture(e.pointerId);
      return;
    }
    // Drawing mode: capture strokes in board coordinates
    if (tool === 'draw') {
      const p = toBoardCoords(e.clientX, e.clientY);
      const start = [[Math.round(p.x), Math.round(p.y)]];
      liveStrokeRef.current = start;
      setLiveStroke(start);
      capture(e.pointerId);
      return;
    }
    const onItem = (e.target as HTMLElement).closest('.sticky, .board-item, .resize-handle, .item-bar');
    if (onItem) return;
    dropSelection();
    if (e.button !== undefined && e.button !== 0 && e.button !== 1) return;
    setSel(null);
    setShowColors(false);
    setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y });
    capture(e.pointerId);
  };

  /** Capture on the element that actually owns the pointer handlers. */
  const capture = (pointerId: number) => {
    try { canvasEl.current?.setPointerCapture(pointerId); } catch { /* ignore */ }
  };

  const lastCursor = useRef(0);
  const broadcastCursor = (clientX: number, clientY: number) => {
    const now = performance.now();
    if (now - lastCursor.current < 45) return;    // ~22 fps is plenty for cursors
    lastCursor.current = now;
    const p = toBoardCoords(clientX, clientY);
    sendRef.current?.({ t: 'cursor', x: Math.round(p.x), y: Math.round(p.y) });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') broadcastCursor(e.clientX, e.clientY);
    if (erasing) {
      if (e.pointerType === 'mouse' && e.buttons === 0) { setErasing(false); return; }
      const p = toBoardCoords(e.clientX, e.clientY);
      eraseAt(p.x, p.y);
      return;
    }
    if (liveStroke) {
      if (e.pointerType === 'mouse' && e.buttons === 0) { finishStroke(); return; }
      const p = toBoardCoords(e.clientX, e.clientY);
      const next = [...(liveStrokeRef.current || []), [Math.round(p.x), Math.round(p.y)]];
      liveStrokeRef.current = next;
      setLiveStroke(next);
      shareInk(next);
      return;
    }
    if (drag && e.pointerType === 'mouse' && e.buttons === 0) { onPointerUp(e); return; }
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const p = pinch.current;
      const k = Math.min(4, Math.max(0.1, p.k * (d / p.dist)));
      setView({
        k,
        x: p.cx - ((p.cx - p.vx) / p.k) * k,
        y: p.cy - ((p.cy - p.vy) / p.k) * k,
      });
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (drag.kind === 'pan') setView((v) => ({ ...v, x: drag.ox + dx, y: drag.oy + dy }));
    else if (drag.kind === 'move') {
      // Ignore sub-pixel jitter: a click selects, it should never nudge.
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) setDrag({ ...drag, moved: true });
      const it = items.find((i) => i.id === drag.id);
      const p = clampToCanvas(drag.ix + dx / view.k, drag.iy + dy / view.k, it?.w ?? 0, it?.h ?? 0);
      update(drag.id, p, false);
    }
    else
      update(
        drag.id,
        { w: Math.max(120, drag.iw + dx / view.k), h: Math.max(90, drag.ih + dy / view.k) },
        false
      );
  };

  const lastInk = useRef(0);
  /** Mirror the in-progress sketch to other editors. */
  const shareInk = (extra?: number[][]) => {
    const now = performance.now();
    if (now - lastInk.current < 70) return;
    lastInk.current = now;
    const all = extra ? [...strokes.current, { pts: extra, c: penColor, w: penWidth }] : strokes.current;
    sendRef.current?.({ t: 'ink', strokes: all });
  };

  const finishStroke = () => {
    // Commit synchronously: a React state updater runs at render time, so
    // broadcasting from inside one would send the sketch *before* the stroke
    // was appended — peers would briefly receive an empty sketch and the ink
    // would vanish on their screen until the next stroke began.
    const st = liveStrokeRef.current;
    if (st && st.length > 1) strokes.current.push({ pts: st, c: penColor, w: penWidth });
    liveStrokeRef.current = null;
    setLiveStroke(null);
    lastInk.current = 0;
    shareInk();
  };

  const onPointerUp = (e?: React.PointerEvent) => {
    if (erasing) { setErasing(false); if (e) pointers.current.delete(e.pointerId); return; }
    if (liveStroke) { finishStroke(); if (e) pointers.current.delete(e.pointerId); return; }
    if (e) pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (drag && drag.kind !== 'pan') {
      const it = items.find((i) => i.id === (drag as any).id);
      if (it) {
        haptic.snap();
        setDropped(it.id);
        setTimeout(() => setDropped((d) => (d === it.id ? null : d)), 360);
        api.patch(`/boards/${id}/items/${it.id}`, { x: it.x, y: it.y, w: it.w, h: it.h, z: it.z }).catch(() => {});
      }
    }
    setDrag(null);
  };

  const startMove = (e: React.PointerEvent, it: BoardItem) => {
    // Left/primary button only — right-click shouldn't start a drag.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    dropSelection();
    if (e.pointerType !== 'mouse') haptic.press();
    setSel(it.id);
    // Don't reshuffle z on every touch; only lift it if something covers it.
    const z = maxZ() + 1;
    if (it.z < z - 1) update(it.id, { z });
    setDrag({ kind: 'move', id: it.id, sx: e.clientX, sy: e.clientY, ix: it.x, iy: it.y, moved: false });
    capture(e.pointerId);
  };

  const startResize = (e: React.PointerEvent, it: BoardItem) => {
    e.stopPropagation();
    setDrag({ kind: 'resize', id: it.id, sx: e.clientX, sy: e.clientY, iw: it.w, ih: it.h });
    capture(e.pointerId);
  };

  /**
   * Suppress text selection on the canvas.
   * `selectstart` isn't in React's typed event list, so bind it natively.
   * Without this, dragging sweeps a selection across labels, which then
   * fights with the drag and leaves highlighted text behind.
   */
  useEffect(() => {
    const el = canvasEl.current;
    if (!el) return;
    const stop = (e: Event) => {
      const t = e.target as HTMLElement | null;
      // Allow selecting inside a field the user is actually editing.
      if (t && (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) &&
          document.activeElement === t) return;
      e.preventDefault();
    };
    el.addEventListener('selectstart', stop);
    return () => el.removeEventListener('selectstart', stop);
  }, [board?.id]);

  // Native, non-passive wheel handling (React's onWheel is passive → preventDefault is ignored)
  useEffect(() => {
    const el = canvasEl.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const r = wrap.current!.getBoundingClientRect();
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        setView((v) => ({ ...v, x: v.x - (e.deltaX || e.deltaY) }));
        return;
      }
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      const dy = e.deltaY * unit;
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setView((v) => {
        const k = Math.min(4, Math.max(0.1, v.k * Math.exp(-dy * 0.0015)));
        return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [board?.id]);

  const zoomBy = (f: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const k = Math.min(4, Math.max(0.1, view.k * f));
    const mx = r.width / 2, my = r.height / 2;
    setView((v) => ({ k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }));
  };

  const fit = () => {
    const r = wrap.current!.getBoundingClientRect();
    if (board?.canvasMode === 'fixed') {
      const pad = 60;
      const k = Math.min((r.width - pad) / board.canvasW, (r.height - pad) / board.canvasH, 2);
      return setView({ k, x: (r.width - board.canvasW * k) / 2, y: (r.height - board.canvasH * k) / 2 });
    }
    if (!items.length) return setView({ x: 0, y: 0, k: 1 });
    const minX = Math.min(...items.map((i) => i.x)) - 60;
    const minY = Math.min(...items.map((i) => i.y)) - 60;
    const maxX = Math.max(...items.map((i) => i.x + i.w)) + 60;
    const maxY = Math.max(...items.map((i) => i.y + i.h)) + 60;
    const k = Math.min(1.4, Math.min(r.width / (maxX - minX), r.height / (maxY - minY)));
    setView({ k, x: -minX * k + (r.width - (maxX - minX) * k) / 2, y: -minY * k + (r.height - (maxY - minY) * k) / 2 });
  };

  /* --------------------------- shortcuts ---------------------------- */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeItem(sel); }
      if (e.key.toLowerCase() === 'n') addItem({ type: 'sticky', data: { text: '' } });
      if (e.key.toLowerCase() === 'f') fit();
      if (sel && (e.key === ']' || e.key === '[')) {
        e.preventDefault();
        const dir = e.key === ']' ? 'up' : 'down';
        moveLayer(sel, e.shiftKey ? (dir === 'up' ? 'front' : 'back') : dir);
      }
      if (e.key.toLowerCase() === 'e' && !e.metaKey && !e.ctrlKey) {
        setTool((t) => (t === 'erase' ? 'select' : 'erase'));
        setSel(null);
      }
      if (e.key.toLowerCase() === 'd') {
        if (tool === 'draw') commitDrawing();
        else { setTool('draw'); setSel(null); }
      }
      if (e.key === 'Escape') {
        if (tool === 'draw') {
          strokes.current = []; liveStrokeRef.current = null; setLiveStroke(null);
          setTool('select'); sendRef.current?.({ t: 'ink:end' });
        }
        setSel(null);
        setShowShapes(false);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [sel, items, view, tool, penColor, penWidth]);

  /** Create a link card from metadata previewed in the dialog. */
  async function addLink(meta: any) {
    const it = await addItem({
      type: 'link',
      w: 280, h: meta?.isProduct ? 250 : 200,
      rotation: 0,
      data: meta,
    });
    haptic.success();
    return it;
  }

  async function addImage(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      try {
        const up = await uploadImage(f);
        await addItem({ type: 'image', w: 280, h: 220, rotation: 0, data: { url: up.url } });
      } catch (e: any) { toast(e.message, 'err'); }
    }
  }

  /** Distance from point to a line segment — used for stroke hit-testing. */
  function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    const cx = ax + t * dx, cy = ay + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  const ERASER_R = 14;

  /** Erase uncommitted strokes under the cursor, and saved drawings they belong to. */
  /**
   * Erase only the ink actually under the cursor.
   *
   * Each stroke is walked point by point; points inside the eraser disc are
   * dropped and the surviving runs become separate strokes. Rubbing through the
   * middle of a line therefore leaves the two ends intact instead of deleting
   * the whole trace. Segments that merely *cross* the disc are split too, so a
   * long straight line with few points still erases where you touch it.
   */
  function eraseStroke<T extends { pts: number[][]; c: string; w: number }>(
    st: T,
    x: number,
    y: number,
    r: number
  ): T[] {
    const tol = r + st.w / 2;
    const inside = (p: number[]) => Math.hypot(p[0] - x, p[1] - y) <= tol;

    // Densify long segments so erasing works mid-segment, not just on vertices.
    const dense: number[][] = [];
    for (let i = 0; i < st.pts.length; i++) {
      const p = st.pts[i];
      if (i > 0) {
        const q = st.pts[i - 1];
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        const steps = Math.min(64, Math.floor(d / Math.max(2, tol / 2)));
        for (let k = 1; k < steps; k++) {
          dense.push([q[0] + ((p[0] - q[0]) * k) / steps, q[1] + ((p[1] - q[1]) * k) / steps]);
        }
      }
      dense.push(p);
    }

    const runs: number[][][] = [];
    let cur: number[][] = [];
    for (const p of dense) {
      if (inside(p)) {
        if (cur.length > 1) runs.push(cur);
        cur = [];
      } else {
        cur.push(p);
      }
    }
    if (cur.length > 1) runs.push(cur);

    // Nothing was touched — hand the original back unchanged.
    if (runs.length === 1 && runs[0].length === dense.length) return [st];
    return runs.map((pts) => ({ ...st, pts }));
  }

  /** True when any part of a stroke lies under the eraser. */
  function strokeTouched(st: { pts: number[][]; w: number }, x: number, y: number, r: number) {
    const tol = r + st.w / 2;
    if (st.pts.length === 1) return Math.hypot(x - st.pts[0][0], y - st.pts[0][1]) <= tol;
    for (let i = 1; i < st.pts.length; i++) {
      const [ax, ay] = st.pts[i - 1], [bx, by] = st.pts[i];
      if (distToSeg(x, y, ax, ay, bx, by) <= tol) return true;
    }
    return false;
  }

  /** Bounding box of a stroke list, padded for stroke width. */
  function strokesBox(list: { pts: number[][]; w: number }[]) {
    const xs = list.flatMap((s) => s.pts.map((p) => p[0]));
    const ys = list.flatMap((s) => s.pts.map((p) => p[1]));
    const pad = Math.max(...list.map((s) => s.w)) + 4;
    const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + pad, maxY = Math.max(...ys) + pad;
    return { x: minX, y: minY, w: Math.max(20, maxX - minX), h: Math.max(20, maxY - minY) };
  }

  /** Erase ink under the cursor, in the working sketch and in saved drawings. */
  function eraseAt(x: number, y: number) {
    const r = ERASER_R / view.k + 4;

    let changed = false;
    strokes.current = strokes.current.flatMap((st) => {
      if (!strokeTouched(st, x, y, r)) return [st];
      changed = true;
      return eraseStroke(st, x, y, r);
    });
    if (changed) { setEraseTick((t) => t + 1); haptic.tap(); lastInk.current = 0; shareInk(); }

    for (const it of items) {
      if (it.type !== 'draw') continue;
      if (x < it.x - r || y < it.y - r || x > it.x + it.w + r || y > it.y + it.h + r) continue;
      const list: { pts: number[][]; c: string; w: number }[] = it.data.strokes || [];
      let hitAny = false;
      const kept = list.flatMap((st) => {
        if (!strokeTouched(st, x, y, r)) return [st];
        hitAny = true;
        return eraseStroke(st, x, y, r);
      });
      if (!hitAny) continue;
      haptic.tap();
      if (!kept.length) { removeItem(it.id); continue; }
      // Reflow the frame so the item keeps hugging its remaining ink.
      const box = strokesBox(kept);
      update(it.id, {
        x: box.x, y: box.y, w: box.w, h: box.h,
        data: { ...it.data, strokes: kept, viewBox: [box.x, box.y, box.w, box.h] },
      });
    }
  }

  /** Turn the in-progress strokes into a saved drawing item. */
  async function commitDrawing() {
    const all = strokes.current;
    if (!all.length) { setTool('select'); return; }
    const xs = all.flatMap((s) => s.pts.map((p) => p[0]));
    const ys = all.flatMap((s) => s.pts.map((p) => p[1]));
    const pad = Math.max(...all.map((s) => s.w)) + 4;
    const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + pad, maxY = Math.max(...ys) + pad;
    const w = Math.max(20, maxX - minX), h = Math.max(20, maxY - minY);
    const it = await api.post<BoardItem>(`/boards/${id}/items`, {
      type: 'draw',
      x: minX, y: minY, w, h, z: maxZ() + 1, rotation: 0, color: 'paper',
      data: { strokes: all, viewBox: [minX, minY, w, h] },
    });
    strokes.current = [];
    setEraseTick((t) => t + 1);
    sendRef.current?.({ t: 'ink:end' });
    setItems((x) => [...x, it]);
    sendRef.current?.({ t: 'item:add', item: it });   // show it on other screens
    haptic.success();
    setTool('select');
    toast('Drawing added');
  }

  /** Update one styling property on a text item. */
  function setTextProp(it: BoardItem, key: string, value: unknown) {
    haptic.tap();
    update(it.id, { data: { ...it.data, [key]: value } });
  }

  /* ----------------------- layer management ----------------------- */

  /** Normalise z to 1..n in current visual order (keeps numbers small). */
  function ordered() {
    return [...items].sort((a, b) => a.z - b.z || a.id - b.id);
  }

  async function applyZ(next: BoardItem[]) {
    const changed = next
      .map((it, idx) => ({ it, z: idx + 1 }))
      .filter(({ it, z }) => it.z !== z);
    if (!changed.length) return;
    setItems((cur) =>
      cur.map((c) => {
        const hit = changed.find(({ it }) => it.id === c.id);
        return hit ? { ...c, z: hit.z } : c;
      })
    );
    haptic.tap();
    await Promise.all(changed.map(({ it, z }) => api.patch(`/boards/${id}/items/${it.id}`, { z })));
  }

  function moveLayer(itemId: number, where: 'front' | 'back' | 'up' | 'down') {
    const list = ordered();
    const i = list.findIndex((x) => x.id === itemId);
    if (i < 0) return;
    const [it] = list.splice(i, 1);
    if (where === 'front') list.push(it);
    else if (where === 'back') list.unshift(it);
    else if (where === 'up') list.splice(Math.min(list.length, i + 1), 0, it);
    else list.splice(Math.max(0, i - 1), 0, it);
    applyZ(list);
    toast(
      where === 'front' ? 'Brought to front'
      : where === 'back' ? 'Sent to back'
      : where === 'up' ? 'Moved forward' : 'Moved back'
    );
  }

  async function shareBoard() {
    const r = await api.post<{ path: string }>('/shares', { type: 'board', id: Number(id) });
    const url = location.origin + r.path;
    try { await navigator.clipboard.writeText(url); toast('Board link copied'); }
    catch { prompt('Share link:', url); }
  }

  if (!board) return <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>;

  const selected = items.find((i) => i.id === sel) || null;

  return (
    <>
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => nav('/boards')}><ArrowLeft size={19} /></button>
        <input
          className="input"
          style={{ border: 'none', background: 'transparent', fontSize: 19, fontWeight: 700, maxWidth: 320 }}
          value={board.name}
          onChange={(e) => {
            setBoard({ ...board, name: e.target.value });
            clearTimeout(saveTimers.current[-1]);
            saveTimers.current[-1] = setTimeout(() => api.patch(`/boards/${id}`, { name: e.target.value }), 500);
          }}
        />
        <div className="grow" />
        {board && (
          <button
            className="presence"
            title="Collaborators"
            onClick={() => { haptic.tap(); setShowPeople(true); }}
          >
            <span className={'live-dot' + (connected ? ' on' : '')} />
            {peers.slice(0, 3).map((p) => (
              <span key={p.sid} className="pav" style={{ background: p.color }}>
                {p.username.charAt(0).toUpperCase()}
              </span>
            ))}
            {peers.length > 3 && <span className="pav more">+{peers.length - 3}</span>}
            <UserPlus size={17} />
          </button>
        )}
        <button
          className="btn icon ghost"
          title="Background"
          onClick={() => {
            const opts = ['dots', 'grid', 'lines', 'plain'];
            const next = opts[(opts.indexOf(board.background) + 1) % opts.length];
            setBoard({ ...board, background: next });
            api.patch(`/boards/${id}`, { background: next });
          }}
        >
          <Grid3x3 size={18} />
        </button>
        <button
          className={'btn icon ghost' + (showCanvasCfg ? ' on' : '')}
          title="Canvas size"
          onClick={() => setShowCanvasCfg((v) => !v)}
        >
          <Frame size={18} />
        </button>
        <button className="btn sm" onClick={shareBoard}><Share2 size={15} /> Share</button>
      </div>

      {showCanvasCfg && (
        <CanvasConfig
          board={board}
          onClose={() => setShowCanvasCfg(false)}
          onApply={async (patch) => {
            setBoard({ ...board, ...patch });
            await api.patch(`/boards/${id}`, patch);
            setShowCanvasCfg(false);
            toast('Canvas updated');
            setTimeout(fit, 30);
          }}
        />
      )}

      <div className="board-wrap" ref={wrap}>
        <div
          className={
            'board-canvas ' +
            (board.canvasMode === 'fixed' ? 'bg-plain' : 'bg-' + board.background) +
            (drag?.kind === 'pan' ? ' panning' : '') +
            (tool === 'draw' ? ' drawing' : '')
          }
          style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${26 * view.k}px ${26 * view.k}px` }}
          ref={canvasEl}
          onDragStart={(e) => e.preventDefault()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={() => onPointerUp()}
          onDoubleClick={(e) => {
            if (e.target !== e.currentTarget) return;
            const p = toBoardCoords(e.clientX, e.clientY);
            addItem({ type: 'sticky', x: p.x - 110, y: p.y - 100, data: { text: '' } });
          }}
        >
          <div
            className="board-surface"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
          >
            {board.canvasMode === 'fixed' && (
              <div
                className={'canvas-page bg-' + board.background}
                style={{
                  left: 0, top: 0, width: board.canvasW, height: board.canvasH,
                  backgroundSize: '26px 26px',
                }}
              >
                <div className="canvas-page-label">
                  {board.canvasW} × {board.canvasH}
                </div>
              </div>
            )}
            {peers.map((p) =>
              p.x == null || p.y == null ? null : (
                <RemoteCursor key={p.sid} peer={p} k={view.k} />
              )
            )}
            {Object.entries(peerInk).map(([sid, list]) => (
              <svg
                key={`peer-${sid}`}
                style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 4999 }}
                width="1" height="1"
              >
                {list.map((st, i) => (
                  <polyline
                    key={i}
                    points={st.pts.map((p) => p.join(',')).join(' ')}
                    fill="none" stroke={st.c} strokeWidth={st.w}
                    strokeLinecap="round" strokeLinejoin="round" opacity={0.85}
                  />
                ))}
              </svg>
            ))}
            {(strokes.current.length > 0 || liveStroke) && (
              <svg
                key={`ink-${eraseTick}`}
                style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 5000 }}
                width="1" height="1"
              >
                {strokes.current.map((st, i) => (
                  <polyline key={i} points={st.pts.map((p) => p.join(',')).join(' ')}
                    fill="none" stroke={st.c} strokeWidth={st.w} strokeLinecap="round" strokeLinejoin="round" />
                ))}
                {liveStroke && (
                  <polyline points={liveStroke.map((p) => p.join(',')).join(' ')}
                    fill="none" stroke={penColor} strokeWidth={penWidth} strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            )}
            {items.map((it) => (
              <Item
                key={it.id}
                it={it}
                selected={sel === it.id}
                onMoveStart={startMove}
                onResizeStart={startResize}
                onChange={update}
                onDelete={removeItem}
                onDuplicate={duplicate}
                dragging={drag?.kind === 'move' && (drag as any).id === it.id}
                fresh={fresh === it.id}
                dropped={dropped === it.id}
              />
            ))}
          </div>
        </div>

        <div className="zoom-pill">
          <button onClick={() => zoomBy(1 / 1.2)}><ZoomOut size={16} /></button>
          <span>{Math.round(view.k * 100)}%</span>
          <button onClick={() => zoomBy(1.2)}><ZoomIn size={16} /></button>
          <button onClick={fit} title="Fit (F)"><Maximize size={15} /></button>
        </div>

        <div className="board-toolbar">
          <button title="Sticky note (N)" onClick={() => { haptic.tap(); addItem({ type: 'sticky', data: { text: '' } }); }}>
            <StickyNote size={20} />
          </button>
          <button title="Pin a link" onClick={() => { haptic.tap(); setLinkDlg(true); }}><Link2 size={20} /></button>
          <button title="Image" onClick={() => { haptic.tap(); fileRef.current?.click(); }}><ImagePlus size={20} /></button>
          <button
            title="Checklist"
            onClick={() => addItem({ type: 'todo', w: 240, h: 210, rotation: 0, color: 'white', data: { title: 'Checklist', items: [{ t: 'First task', d: false }] } })}
          >
            <CheckSquare size={20} />
          </button>
          <button
            title="Text label"
            onClick={() => { haptic.tap(); addItem({ type: 'text', w: 260, h: 70, rotation: 0, data: { text: 'Heading' } }); }}
          >
            <Type size={20} />
          </button>
          <button
            className={showShapes ? 'on' : ''}
            title="Shapes"
            onClick={() => { haptic.tap(); setShowShapes((v) => !v); setShowColors(false); }}
          >
            <Shapes size={20} />
          </button>
          <button
            className={tool === 'erase' ? 'on' : ''}
            title="Eraser (E)"
            onClick={() => { haptic.tap(); setTool((t) => (t === 'erase' ? 'select' : 'erase')); setSel(null); }}
          >
            <Eraser size={20} />
          </button>
          <button
            className={tool === 'draw' ? 'on' : ''}
            title="Draw (D)"
            onClick={() => {
              haptic.tap();
              if (tool === 'draw') commitDrawing();
              else { setTool('draw'); setSel(null); }
            }}
          >
            <Pencil size={20} />
          </button>
          {selected && (
            <>
              <div className="tb-div" />
              <button className={showColors ? 'on' : ''} title="Colour" onClick={() => setShowColors((s) => !s)}>
                <Palette size={20} />
              </button>
              <button title="Duplicate" onClick={() => duplicate(selected)}><Copy size={19} /></button>
              <button title="Delete" onClick={() => removeItem(selected.id)}><Trash2 size={19} /></button>
            </>
          )}
        </div>

        {showShapes && (
          <div className="board-toolbar" style={{ bottom: 86 }}>
            {[
              ['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle'],
              ['diamond', 'Diamond'], ['star', 'Star'], ['arrow', 'Arrow'], ['line', 'Line'],
            ].map(([kind, label]) => (
              <button
                key={kind}
                title={label}
                onClick={() => {
                  haptic.tap();
                  addItem({
                    type: 'shape',
                    w: kind === 'line' || kind === 'arrow' ? 220 : 170,
                    h: kind === 'line' || kind === 'arrow' ? 80 : 170,
                    rotation: 0,
                    data: { shape: kind },
                  });
                  setShowShapes(false);
                }}
              >
                <ShapeGlyph kind={kind} />
              </button>
            ))}
          </div>
        )}

        {tool === 'draw' && (
          <div className="board-toolbar draw-bar" style={{ bottom: 86 }}>
            {['#e5326b', '#f2681f', '#f5b800', '#0aa87e', '#1e8fd5', '#6d5efc', '#191621'].map((c) => (
              <button
                key={c}
                title="Pen colour"
                onClick={() => { haptic.tap(); setPenColor(c); }}
                style={{ width: 34 }}
              >
                <span
                  style={{
                    width: 20, height: 20, borderRadius: '50%', background: c, display: 'block',
                    outline: penColor === c ? '2.5px solid var(--accent)' : '1.5px solid var(--border)',
                    outlineOffset: 2,
                  }}
                />
              </button>
            ))}
            <div className="tb-div" />
            {[2, 4, 8, 14].map((w) => (
              <button key={w} title={`${w}px`} onClick={() => { haptic.tap(); setPenWidth(w); }} style={{ width: 34 }}>
                <span
                  style={{
                    width: Math.min(18, w + 4), height: Math.min(18, w + 4), borderRadius: '50%',
                    background: penWidth === w ? 'var(--accent)' : 'var(--text-dim)', display: 'block',
                  }}
                />
              </button>
            ))}
            <div className="tb-div" />
            <button
              title="Undo last stroke"
              onClick={() => {
                strokes.current = strokes.current.slice(0, -1);
                liveStrokeRef.current = null; setLiveStroke(null);
                setEraseTick((t) => t + 1); lastInk.current = 0; shareInk(); haptic.tap();
              }}
            >
              <Undo2 size={19} />
            </button>
            <button
              title="Eraser (E)"
              onClick={() => { haptic.tap(); setTool('erase'); }}
            >
              <Eraser size={19} />
            </button>
            <button title="Finish drawing" className="on" onClick={commitDrawing}>
              <Check size={20} />
            </button>
          </div>
        )}

        {tool === 'erase' && (
          <div className="board-toolbar draw-bar" style={{ bottom: 86 }}>
            <span className="tb-hint">Eraser — drag over ink to rub it out</span>
            <div className="tb-div" />
            <button title="Back to drawing" onClick={() => { haptic.tap(); setTool('draw'); }}>
              <Pencil size={19} />
            </button>
            <button title="Done" className="on" onClick={() => { haptic.tap(); strokes.current.length ? commitDrawing() : setTool('select'); }}>
              <Check size={20} />
            </button>
          </div>
        )}

        {showColors && selected && (
          <div className="board-toolbar" style={{ bottom: 86 }}>
            {Object.entries(STICKY_COLORS).map(([name, hex]) => (
              <button key={name} onClick={() => { update(selected.id, { color: name }); setShowColors(false); }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: hex, display: 'block' }} />
              </button>
            ))}
          </div>
        )}

        {selected?.type === 'text' && tool === 'select' && (
          <div className="board-toolbar text-bar" style={{ bottom: 146 }}>
            <button title="Smaller" onClick={() => setTextProp(selected, 'size', Math.max(11, (selected.data.size ?? 27) - 4))}>
              <Minus size={17} />
            </button>
            <span className="tb-hint" style={{ minWidth: 38, textAlign: 'center' }}>{selected.data.size ?? 27}</span>
            <button title="Bigger" onClick={() => setTextProp(selected, 'size', Math.min(160, (selected.data.size ?? 27) + 4))}>
              <Plus size={17} />
            </button>
            <div className="tb-div" />
            <button
              title="Bold"
              className={(selected.data.weight ?? 750) >= 700 ? 'on' : ''}
              onClick={() => setTextProp(selected, 'weight', (selected.data.weight ?? 750) >= 700 ? 400 : 800)}
            >
              <Bold size={17} />
            </button>
            <button
              title="Italic"
              className={selected.data.italic ? 'on' : ''}
              onClick={() => setTextProp(selected, 'italic', !selected.data.italic)}
            >
              <Italic size={17} />
            </button>
            <div className="tb-div" />
            {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Ico]) => (
              <button
                key={a}
                title={`Align ${a}`}
                className={(selected.data.align || 'left') === a ? 'on' : ''}
                onClick={() => setTextProp(selected, 'align', a)}
              >
                <Ico size={17} />
              </button>
            ))}
            <div className="tb-div" />
            <button
              title="Heading / body font"
              className={selected.data.font ? 'on' : ''}
              onClick={() =>
                setTextProp(selected, 'font', selected.data.font ? '' : 'var(--font-display)')
              }
            >
              <Type size={17} />
            </button>
            {['', '#e5326b', '#f2681f', '#0aa87e', '#1e8fd5', '#6d5efc'].map((c) => (
              <button
                key={c || 'default'}
                title={c ? 'Text colour' : 'Default colour'}
                onClick={() => setTextProp(selected, 'color', c)}
                style={{ width: 30 }}
              >
                <span
                  style={{
                    width: 16, height: 16, borderRadius: '50%',
                    background: c || 'var(--text)', display: 'block',
                    outline: (selected.data.color || '') === c ? '2.5px solid var(--accent)' : '1.5px solid var(--border)',
                    outlineOffset: 2,
                  }}
                />
              </button>
            ))}
          </div>
        )}

        {selected && tool === 'select' && (
          <div className="board-toolbar sel-bar">
            <span className="tb-hint">Layer {ordered().findIndex((x) => x.id === selected.id) + 1}/{items.length}</span>
            <div className="tb-div" />
            <button title="Send to back (Shift+[)" onClick={() => moveLayer(selected.id, 'back')}><SendToBack size={19} /></button>
            <button title="Move back ([)" onClick={() => moveLayer(selected.id, 'down')}><ChevronDown size={19} /></button>
            <button title="Move forward (])" onClick={() => moveLayer(selected.id, 'up')}><ChevronUp size={19} /></button>
            <button title="Bring to front (Shift+])" onClick={() => moveLayer(selected.id, 'front')}><BringToFront size={19} /></button>
            <div className="tb-div" />
            {selected.type === 'link' && (
              <button title="Edit link" onClick={() => { haptic.tap(); setEditLink(selected); }}><Pencil size={19} /></button>
            )}
            {selected.type === 'image' && (
              <button title="Replace image" onClick={() => { haptic.tap(); replaceRef.current?.click(); }}><ImageIcon size={19} /></button>
            )}
            {(selected.type === 'shape' || selected.type === 'sticky' || selected.type === 'text') && (
              <button title="Colour" onClick={() => { haptic.tap(); setShowColors((v) => !v); }}><Palette size={19} /></button>
            )}
            <button title="Duplicate" onClick={() => duplicate(selected)}><Copy size={19} /></button>
            <button title="Delete" onClick={() => removeItem(selected.id)}><Trash2 size={19} /></button>
          </div>
        )}

        {(linkDlg || editLink) && (
          <LinkDialog
            initial={editLink?.data?.url || ''}
            editing={!!editLink}
            onClose={() => { setLinkDlg(false); setEditLink(null); }}
            onSave={async (meta) => {
              if (editLink) {
                update(editLink.id, { data: meta });
                haptic.success();
                toast('Link updated');
              } else {
                await addLink(meta);
              }
              setLinkDlg(false);
              setEditLink(null);
            }}
          />
        )}

        {showPeople && board && (
          <PeopleDialog boardId={board.id} peers={peers} onClose={() => setShowPeople(false)} />
        )}

        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImage(e.target.files)} />
        <input
          ref={replaceRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f || !selected) return;
            try {
              const up = await uploadImage(f);
              update(selected.id, { data: { ...selected.data, url: up.url } });
              haptic.success();
              toast('Image replaced');
            } catch (err: any) { toast(err.message, 'err'); }
          }}
        />
      </div>
    </>
  );
}

function Item({
  it, selected, dragging, fresh, dropped, onMoveStart, onResizeStart, onChange,
}: {
  it: BoardItem;
  selected: boolean;
  dragging: boolean;
  fresh?: boolean;
  dropped?: boolean;
  onMoveStart: (e: React.PointerEvent, it: BoardItem) => void;
  onResizeStart: (e: React.PointerEvent, it: BoardItem) => void;
  onChange: (id: number, p: Partial<BoardItem>) => void;
  onDelete?: (id: number) => void;
  onDuplicate?: (it: BoardItem) => void;
}) {
  const base: React.CSSProperties = {
    left: it.x, top: it.y, width: it.w, height: it.h, zIndex: it.z,
    transform: it.rotation ? `rotate(${it.rotation}deg)` : undefined,
    ['--drag-rot' as any]: `${it.rotation || 0}deg`,
  };
  const cls = (extra = '') =>
    `${extra} ${dragging ? 'dragging' : ''} ${selected ? 'selected' : ''} ${fresh ? 'item-new' : ''} ${dropped ? 'item-dropped' : ''}`;

  if (it.type === 'sticky') {
    return (
      <div
        className={cls('sticky')}
        style={{ ...base, background: STICKY_COLORS[it.color] || STICKY_COLORS.yellow }}
        onPointerDown={(e) => onMoveStart(e, it)}
      >
        <textarea
          value={it.data.text || ''}
          placeholder="Type…"
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange(it.id, { data: { ...it.data, text: e.target.value } })}
        />
        <div className="resize-handle" onPointerDown={(e) => onResizeStart(e, it)} />
      </div>
    );
  }

  if (it.type === 'link') {
    const host = hostOf(it.data.url);
    const d = it.data;
    // Layout adapts to the card's current size, so resizing feels dynamic.
    const compact = it.h < 132 || it.w < 170;   // no banner, one line
    const wide = it.w >= 330 && it.h < 190;     // side-by-side thumb + text
    const thumbH = wide ? undefined : Math.max(52, Math.min(it.h * 0.52, it.h - 74));
    const titleLines = compact ? 1 : it.h > 260 ? 4 : 2;
    const showDesc = !compact && !wide && it.h > 230 && d.description;

    return (
      <div
        className={cls('board-item link-card') + (wide ? ' lc-wide' : '')}
        style={base}
        onPointerDown={(e) => onMoveStart(e, it)}
      >
        {!compact && (
          <div
            className="lc-thumb"
            style={{
              height: wide ? '100%' : thumbH,
              width: wide ? Math.min(it.w * 0.42, 190) : undefined,
              backgroundImage: d.image ? `url(${d.image})` : undefined,
              backgroundSize: d.isProduct ? 'contain' : 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              // No photo? Tint the banner with the site's own brand colour.
              background: d.image ? undefined : brandGradient(d),
              backgroundColor: d.image && d.isProduct ? '#fff' : undefined,
            }}
          >
            {!d.image && <LinkFallback meta={d} small={it.w < 220} />}
            {d.discountPercent ? <span className="lc-off">-{d.discountPercent}%</span> : null}
          </div>
        )}

        <div className="lc-body">
          <div
            className="lc-title"
            style={{ WebkitLineClamp: titleLines, fontSize: it.w < 200 ? 13 : 14.5 }}
          >
            {d.title || host}
          </div>

          {showDesc && <div className="lc-desc">{d.description}</div>}

          {d.isProduct && d.priceFormatted && (
            <div className="lc-price-row">
              <span className="lc-price">{d.priceFormatted}</span>
              {d.listPriceFormatted && <s className="lc-was">{d.listPriceFormatted}</s>}
              {d.availability && /out/i.test(d.availability) && (
                <span className="lc-stock out">Out of stock</span>
              )}
            </div>
          )}

          <div className="lc-host">
            {d.favicon && (
              <img src={d.favicon} alt="" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} />
            )}
            {d.siteName || host}
          </div>
        </div>

        <button
          className="btn primary sm lc-open"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => window.open(d.url, '_blank', 'noopener')}
        >
          {d.isProduct ? 'Buy' : 'Open'}
        </button>
        <div className="resize-handle" onPointerDown={(e) => onResizeStart(e, it)} />
      </div>
    );
  }

  if (it.type === 'image') {
    return (
      <div className={cls('board-item')} style={{ ...base, padding: 0 }} onPointerDown={(e) => onMoveStart(e, it)}>
        <img src={it.data.url} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <div className="resize-handle" onPointerDown={(e) => onResizeStart(e, it)} />
      </div>
    );
  }

  if (it.type === 'todo') {
    const list: { t: string; d: boolean }[] = it.data.items || [];
    const setList = (l: any[]) => onChange(it.id, { data: { ...it.data, items: l } });
    return (
      <div
        className={cls('board-item')}
        style={{ ...base, background: STICKY_COLORS[it.color] || '#f5f3ea', color: '#23231f', padding: 12 }}
        onPointerDown={(e) => onMoveStart(e, it)}
      >
        <input
          value={it.data.title || ''}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange(it.id, { data: { ...it.data, title: e.target.value } })}
          style={{ background: 'transparent', border: 'none', outline: 'none', fontWeight: 700, fontSize: 14.5, marginBottom: 8, color: 'inherit', width: '100%' }}
        />
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }} onPointerDown={(e) => e.stopPropagation()}>
          {list.map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5 }}>
              <button
                className={row.d ? 'check-pop' : ''}
                onClick={() => { haptic.tap(); setList(list.map((r, j) => (j === i ? { ...r, d: !r.d } : r))); }}
                style={{ display: 'grid', color: 'inherit' }}
              >
                {row.d ? <CheckSquare size={15} /> : <Square size={15} />}
              </button>
              <input
                value={row.t}
                onChange={(e) => setList(list.map((r, j) => (j === i ? { ...r, t: e.target.value } : r)))}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'inherit', textDecoration: row.d ? 'line-through' : 'none', opacity: row.d ? 0.55 : 1 }}
              />
              <button onClick={() => setList(list.filter((_, j) => j !== i))} style={{ display: 'grid', color: 'inherit', opacity: .45 }}>
                <X size={13} />
              </button>
            </div>
          ))}
          <button onClick={() => setList([...list, { t: '', d: false }])} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: .6, color: 'inherit', padding: '2px 0' }}>
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="resize-handle" onPointerDown={(e) => onResizeStart(e, it)} />
      </div>
    );
  }

  if (it.type === 'shape') {
    const kind = it.data.shape || 'rect';
    const fill = STICKY_COLORS[it.color] || STICKY_COLORS.yellow;
    const filled = it.data.filled !== false;
    return (
      <div
        className={cls('board-item shape-item')}
        style={{ ...base, background: 'transparent', border: 'none', boxShadow: 'none', overflow: 'visible' }}
        onPointerDown={(e) => onMoveStart(e, it)}
      >
        {/* Drawn in real pixel space so strokes and corners never distort. */}
        <ShapeSvg kind={kind} w={it.w} h={it.h} fill={filled ? fill : 'none'} stroke="rgba(0,0,0,.42)" />
        {it.data.label ? <div className="shape-label">{it.data.label}</div> : null}
        <div className="resize-handle" onPointerDown={(e) => onResizeStart(e, it)} />
      </div>
    );
  }

  if (it.type === 'draw') {
    const strokes: { pts: number[][]; c: string; w: number }[] = it.data.strokes || [];
    const vb = it.data.viewBox || [0, 0, it.w, it.h];
    return (
      <div
        className={cls('board-item draw-item')}
        style={{ ...base, background: 'transparent', border: 'none', boxShadow: 'none' }}
        onPointerDown={(e) => onMoveStart(e, it)}
      >
        <svg width="100%" height="100%" viewBox={vb.join(' ')} preserveAspectRatio="none" style={{ display: 'block', pointerEvents: 'none' }}>
          {strokes.map((st, i) => (
            <polyline
              key={i}
              points={st.pts.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke={st.c}
              strokeWidth={st.w}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
        <div className="resize-handle" onPointerDown={(e) => onResizeStart(e, it)} />
      </div>
    );
  }

  // text label
  const td = it.data || {};
  const align = td.align || 'left';
  return (
    <div
      className={cls('board-item text-item')}
      style={{
        ...base,
        background: td.bg || 'transparent',
        border: 'none',
        boxShadow: 'none',
        padding: 4,
        borderRadius: td.bg ? 12 : undefined,
      }}
      onPointerDown={(e) => onMoveStart(e, it)}
    >
      {/* Drag anywhere on the block; click once more to put the caret in. */}
      <textarea
        value={td.text || ''}
        placeholder="Type…"
        readOnly={!selected}
        onPointerDown={(e) => { if (selected) e.stopPropagation(); }}
        onChange={(e) => onChange(it.id, { data: { ...td, text: e.target.value } })}
        style={{
          width: '100%', height: '100%', background: 'transparent', border: 'none',
          outline: 'none', resize: 'none', fontFamily: td.font || 'inherit',
          fontSize: td.size ?? 27,
          fontWeight: td.weight ?? 750,
          fontStyle: td.italic ? 'italic' : 'normal',
          letterSpacing: `${td.tracking ?? -0.6}px`,
          lineHeight: td.leading ?? 1.18,
          textAlign: align as any,
          color: td.color || 'var(--text)',
          cursor: selected ? 'text' : 'grab',
          padding: 0,
        }}
      />
      <div className="resize-handle" onPointerDown={(e) => onResizeStart(e, it)} />
    </div>
  );
}

/**
 * Renders a shape at its true pixel size. Using the element's own width/height
 * as the viewBox (instead of a fixed 0 0 100 100 box with preserveAspectRatio="none")
 * keeps stroke weight even and corner radii circular no matter how the item is
 * squashed or stretched.
 */
/** Gradient used when a link has no image — tinted by the site's brand colour. */
export function brandGradient(meta: any) {
  const c = meta?.brandColor || '#6d5efc';
  return `linear-gradient(135deg, ${c} 0%, ${c}cc 45%, rgba(0,0,0,.42) 100%)`;
}

/** Big initial shown on imageless link cards. */
export function LinkFallback({ meta, small }: { meta: any; small?: boolean }) {
  const label = (meta?.siteName || hostOf(meta?.url || '') || '?').replace(/^www\./, '');
  return (
    <div className="lc-fallback" style={{ background: brandGradient(meta) }}>
      {meta?.favicon ? (
        <img src={meta.favicon} alt="" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} />
      ) : null}
      <span style={{ fontSize: small ? 15 : 21 }}>{label.charAt(0).toUpperCase()}</span>
    </div>
  );
}

/**
 * In-app link dialog. Fetches metadata as you type and shows the card exactly
 * as it will appear on the board, so nothing is added blind.
 */
function LinkDialog({
  initial, editing, onClose, onSave,
}: {
  initial: string;
  editing: boolean;
  onClose: () => void;
  onSave: (meta: any) => void | Promise<void>;
}) {
  const [url, setUrl] = useState(initial);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const raw = url.trim();
    if (!raw || !/\.\w{2,}/.test(raw)) { setMeta(null); setErr(''); return; }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const m = await api.post<any>('/unfurl', { url: raw });
        if (seq.current !== mine) return;           // a newer keystroke won
        setMeta(m);
        setErr(m.blocked ? 'That site blocked the preview — title taken from the URL.' : '');
      } catch (e: any) {
        if (seq.current === mine) { setMeta(null); setErr(e.message || 'Could not reach that page'); }
      } finally {
        if (seq.current === mine) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [url]);

  const save = async () => {
    const raw = url.trim();
    if (!raw) return;
    setSaving(true);
    const payload = meta?.url && meta.url.includes(raw.replace(/^https?:\/\//, '').split('/')[0])
      ? meta
      : { url: /^https?:\/\//i.test(raw) ? raw : 'https://' + raw, title: raw, isProduct: false };
    await onSave(payload);
    setSaving(false);
  };

  return (
    <Sheet onClose={onClose} maxWidth={440}>
      <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
        {editing ? 'Edit link' : 'Pin a link'}
      </h3>
      <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
        Paste any URL — products show their price and photo.
      </p>

      <input
        className="input no-drag"
        autoFocus
        placeholder="https://example.com/product"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !loading) save(); }}
      />

      <div className="lc-preview-wrap">
        {loading && <div className="lc-preview-empty"><span className="spinner" /> Fetching preview…</div>}
        {!loading && !meta && <div className="lc-preview-empty">Preview appears here</div>}
        {!loading && meta && (
          <div className="board-item link-card lc-preview" style={{ width: 260, height: meta.isProduct ? 250 : 200 }}>
            <div
              className="lc-thumb"
              style={{
                height: '50%',
                backgroundImage: meta.image ? `url(${meta.image})` : undefined,
                backgroundSize: meta.isProduct ? 'contain' : 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                background: meta.image ? undefined : brandGradient(meta),
                backgroundColor: meta.image && meta.isProduct ? '#fff' : undefined,
              }}
            >
              {!meta.image && <LinkFallback meta={meta} />}
              {meta.discountPercent ? <span className="lc-off">-{meta.discountPercent}%</span> : null}
            </div>
            <div className="lc-body">
              <div className="lc-title" style={{ WebkitLineClamp: 2 }}>{meta.title}</div>
              {meta.isProduct && meta.priceFormatted && (
                <div className="lc-price-row">
                  <span className="lc-price">{meta.priceFormatted}</span>
                  {meta.listPriceFormatted && <s className="lc-was">{meta.listPriceFormatted}</s>}
                </div>
              )}
              <div className="lc-host">{meta.siteName || hostOf(meta.url)}</div>
            </div>
          </div>
        )}
      </div>

      {err && <div className="lc-warn">{err}</div>}

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <div className="grow" />
        <button className="btn primary" disabled={!url.trim() || saving} onClick={save}>
          {saving ? 'Saving…' : editing ? 'Update link' : 'Add to board'}
        </button>
      </div>
    </Sheet>
  );
}

/** Another editor's pointer, drawn in board space so it tracks pan and zoom. */
function RemoteCursor({ peer, k }: { peer: Peer; k: number }) {
  return (
    <div
      className="rcursor"
      style={{
        left: peer.x!, top: peer.y!, zIndex: 9999,
        // Counter-scale so the cursor stays a constant size on screen.
        transform: `scale(${1 / k})`,
      }}
    >
      <svg width="22" height="22" viewBox="0 0 22 22">
        <path d="M3 2l14 6.5-6 1.6-2.4 5.6z" fill={peer.color} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span className="rname" style={{ background: peer.color }}>{peer.username}</span>
    </div>
  );
}

/** Invite people to edit this board. */
function PeopleDialog({
  boardId, peers, onClose,
}: { boardId: number; peers: Peer[]; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { toast } = useApp();

  const load = useCallback(async () => {
    try { setData(await api.get<any>(`/boards/${boardId}/collaborators`)); }
    catch { /* board may have been removed */ }
  }, [boardId]);
  useEffect(() => { load(); }, [load]);

  const online = (userId: number) => peers.some((p) => p.id === userId);

  const invite = async () => {
    const u = name.trim();
    if (!u) return;
    setBusy(true); setErr('');
    try {
      await api.post(`/boards/${boardId}/collaborators`, { username: u });
      setName('');
      haptic.success();
      toast(`${u} can now edit this board`);
      load();
    } catch (e: any) { setErr(e.message || 'Could not invite that user'); }
    finally { setBusy(false); }
  };

  const remove = async (userId: number, username: string) => {
    await api.del(`/boards/${boardId}/collaborators/${userId}`);
    toast(`Removed ${username}`);
    load();
  };

  return (
    <Sheet onClose={onClose} maxWidth={420}>
      <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>Collaborators</h3>
      <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
        Invited people can edit this board live and you'll see their cursors.
      </p>

      {data?.isOwner && (
        <>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input no-drag"
              placeholder="Username to invite"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && invite()}
            />
            <button className="btn primary" disabled={busy || !name.trim()} onClick={invite}>Invite</button>
          </div>
          {err && <div className="lc-warn">{err}</div>}
        </>
      )}

      <div className="people-list">
        {data?.owner && (
          <div className="person">
            <span className="pav lg" style={{ background: '#6d5efc' }}>
              {data.owner.username.charAt(0).toUpperCase()}
            </span>
            <div className="grow">
              <div style={{ fontWeight: 650 }}>{data.owner.username}</div>
              <div className="muted" style={{ fontSize: 12 }}>Owner</div>
            </div>
            {online(data.owner.id) && <span className="live-tag">online</span>}
          </div>
        )}
        {data?.collaborators?.map((c: any) => (
          <div className="person" key={c.id}>
            <span className="pav lg" style={{ background: peers.find((p) => p.id === c.id)?.color || '#8a8f98' }}>
              {c.username.charAt(0).toUpperCase()}
            </span>
            <div className="grow">
              <div style={{ fontWeight: 650 }}>{c.username}</div>
              <div className="muted" style={{ fontSize: 12 }}>{c.role}</div>
            </div>
            {online(c.id) && <span className="live-tag">online</span>}
            {data.isOwner && (
              <button className="btn icon ghost sm" title="Remove" onClick={() => remove(c.id, c.username)}>
                <X size={16} />
              </button>
            )}
          </div>
        ))}
        {data && !data.collaborators?.length && (
          <div className="muted" style={{ fontSize: 13, padding: '10px 2px' }}>
            {data.isOwner ? 'No one invited yet.' : 'Only you and the owner are here.'}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function ShapeSvg({
  kind, w, h, fill, stroke, sw = 2.5,
}: { kind: string; w: number; h: number; fill: string; stroke: string; sw?: number }) {
  const W = Math.max(1, w), H = Math.max(1, h);
  const i = sw / 2 + 0.5;                       // inset so the stroke stays inside
  const common = { fill, stroke, strokeWidth: sw, strokeLinejoin: 'round' as const };
  const pts = (arr: number[][]) => arr.map(([px, py]) => `${px},${py}`).join(' ');
  // Corner radius scales with the shorter side, so wide rectangles stay sane.
  const r = Math.max(2, Math.min(14, Math.min(W, H) * 0.09));
  const body = () => {
    switch (kind) {
      case 'ellipse':
        return <ellipse cx={W / 2} cy={H / 2} rx={Math.max(1, W / 2 - i)} ry={Math.max(1, H / 2 - i)} {...common} />;
      case 'triangle':
        return <polygon points={pts([[W / 2, i], [W - i, H - i], [i, H - i]])} {...common} />;
      case 'diamond':
        return <polygon points={pts([[W / 2, i], [W - i, H / 2], [W / 2, H - i], [i, H / 2]])} {...common} />;
      case 'star': {
        const cx = W / 2, cy = H / 2, rx = W / 2 - i, ry = H / 2 - i, p: number[][] = [];
        for (let k = 0; k < 10; k++) {
          const ang = (Math.PI / 5) * k - Math.PI / 2;
          const f = k % 2 ? 0.44 : 1;
          p.push([cx + Math.cos(ang) * rx * f, cy + Math.sin(ang) * ry * f]);
        }
        return <polygon points={pts(p)} {...common} />;
      }
      case 'arrow': {
        // Head keeps a fixed proportion of the height, so long arrows stay arrow-shaped.
        const head = Math.min(W * 0.4, H * 0.9);
        const bar = Math.max(3, Math.min(H * 0.28, 18));
        const cy = H / 2, c = fill === 'none' ? stroke : fill;
        return (
          <g>
            <line x1={i} y1={cy} x2={Math.max(i, W - head)} y2={cy} stroke={c} strokeWidth={bar} strokeLinecap="round" />
            <polygon points={pts([[W - head, cy - head / 2], [W - i, cy], [W - head, cy + head / 2]])} fill={c} />
          </g>
        );
      }
      case 'line': {
        const c = fill === 'none' ? stroke : fill;
        return <line x1={i} y1={H / 2} x2={W - i} y2={H / 2} stroke={c} strokeWidth={Math.max(3, Math.min(H * 0.3, 16))} strokeLinecap="round" />;
      }
      default:
        return <rect x={i} y={i} width={Math.max(1, W - sw - 1)} height={Math.max(1, H - sw - 1)} rx={r} {...common} />;
    }
  };
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      {body()}
    </svg>
  );
}

function ShapeGlyph({ kind }: { kind: string }) {
  const c = { fill: 'none', stroke: 'currentColor', strokeWidth: 6, strokeLinejoin: 'round' as const };
  return (
    <svg width="20" height="20" viewBox="0 0 100 100">
      {kind === 'rect' && <rect x="8" y="8" width="84" height="84" rx="10" {...c} />}
      {kind === 'ellipse' && <ellipse cx="50" cy="50" rx="43" ry="43" {...c} />}
      {kind === 'triangle' && <polygon points="50,8 92,92 8,92" {...c} />}
      {kind === 'diamond' && <polygon points="50,6 94,50 50,94 6,50" {...c} />}
      {kind === 'star' && <polygon points="50,6 62,38 95,38 68,60 79,93 50,72 21,93 32,60 5,38 38,38" {...c} />}
      {kind === 'arrow' && (
        <g>
          <line x1="10" y1="50" x2="78" y2="50" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
          <polygon points="70,30 95,50 70,70" fill="currentColor" />
        </g>
      )}
      {kind === 'line' && <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />}
    </svg>
  );
}

function CanvasConfig({
  board, onClose, onApply,
}: {
  board: BoardT;
  onClose: () => void;
  onApply: (p: { canvasMode: 'infinite' | 'fixed'; canvasW: number; canvasH: number }) => void;
}) {
  const [mode, setMode] = useState<'infinite' | 'fixed'>(board.canvasMode);
  const [w, setW] = useState(board.canvasW);
  const [h, setH] = useState(board.canvasH);

  return (
    <Sheet onClose={onClose} maxWidth={440}>
      <>
        <div className="modal-head">
          <h2>Canvas</h2>
          <div className="grow" />
          <button className="btn icon ghost" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="seg" style={{ alignSelf: 'flex-start' }}>
            <button className={mode === 'infinite' ? 'on' : ''} onClick={() => setMode('infinite')}>Infinite</button>
            <button className={mode === 'fixed' ? 'on' : ''} onClick={() => setMode('fixed')}>Fixed size</button>
          </div>

          {mode === 'infinite' ? (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              The board stretches forever in every direction — pan and zoom as far as you like.
            </p>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                Items are kept inside a fixed page, so the board matches an exact pixel size.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {CANVAS_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    className={'btn sm' + (w === p.w && h === p.h ? ' accent' : '')}
                    style={{ justifyContent: 'center' }}
                    onClick={() => { setW(p.w); setH(p.h); }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="row">
                <div className="field grow" style={{ margin: 0 }}>
                  <label>Width (px)</label>
                  <input className="input" type="number" min={320} max={10000} value={w} onChange={(e) => setW(+e.target.value)} />
                </div>
                <div className="field grow" style={{ margin: 0 }}>
                  <label>Height (px)</label>
                  <input className="input" type="number" min={320} max={10000} value={h} onChange={(e) => setH(+e.target.value)} />
                </div>
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <div className="grow" />
          <button className="btn sm" onClick={onClose}>Cancel</button>
          <button
            className="btn primary sm"
            onClick={() => onApply({ canvasMode: mode, canvasW: Math.max(320, Math.min(10000, w)), canvasH: Math.max(320, Math.min(10000, h)) })}
          >
            Apply
          </button>
        </div>
      </>
    </Sheet>
  );
}
