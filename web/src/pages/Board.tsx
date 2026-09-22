import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, StickyNote, Link2, ImagePlus, Trash2, Copy, Share2, ZoomIn, ZoomOut,
  Maximize, Palette, Grid3x3, Type, CheckSquare, Square, Plus, X, Frame,
} from 'lucide-react';
import { api, uploadImage, CANVAS_PRESETS, type Board as BoardT, type BoardItem } from '../api';
import { useApp } from '../store';
import { STICKY_COLORS, hostOf } from '../colors';
import { haptic } from '../lib/haptics';
import Sheet from '../lib/Sheet';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'move'; id: number; sx: number; sy: number; ix: number; iy: number }
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
  const [dropped, setDropped] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
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
    if (save) queueSave(itemId, patch);
  };

  const removeItem = async (itemId: number) => {
    haptic.warn();
    setItems((x) => x.filter((i) => i.id !== itemId));
    setSel(null);
    await api.del(`/boards/${id}/items/${itemId}`).catch(() => {});
  };

  const duplicate = async (it: BoardItem) => {
    const copy = await api.post<BoardItem>(`/boards/${id}/items`, {
      ...it, x: it.x + 24, y: it.y + 24, z: maxZ() + 1,
    });
    setItems((x) => [...x, copy]);
    setSel(copy.id);
  };

  /* ------------------------ pointer handling ------------------------ */
  const lastTap = useRef<{ t: number; x: number; y: number }>({ t: 0, x: 0, y: 0 });

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
    if (e.target !== e.currentTarget) return;
    setSel(null);
    setShowColors(false);
    setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const p = pinch.current;
      const k = Math.min(2.5, Math.max(0.25, p.k * (d / p.dist)));
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

  const onPointerUp = (e?: React.PointerEvent) => {
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
    e.stopPropagation();
    if (e.pointerType !== 'mouse') haptic.press();
    setSel(it.id);
    const z = maxZ() + 1;
    if (it.z < z - 1) update(it.id, { z });
    setDrag({ kind: 'move', id: it.id, sx: e.clientX, sy: e.clientY, ix: it.x, iy: it.y });
    wrap.current?.setPointerCapture(e.pointerId);
  };

  const startResize = (e: React.PointerEvent, it: BoardItem) => {
    e.stopPropagation();
    setDrag({ kind: 'resize', id: it.id, sx: e.clientX, sy: e.clientY, iw: it.w, ih: it.h });
    wrap.current?.setPointerCapture(e.pointerId);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const r = wrap.current!.getBoundingClientRect();
      const k = Math.min(2.5, Math.max(0.25, view.k * (1 - e.deltaY * 0.002)));
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setView((v) => ({ k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }));
    } else {
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
  };

  const zoomBy = (f: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const k = Math.min(2.5, Math.max(0.25, view.k * f));
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
      if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [sel, items, view]);

  async function addLink() {
    const url = prompt('Paste a URL to pin on the board');
    if (!url) return;
    const it = await addItem({ type: 'link', w: 250, h: 180, rotation: 0, data: { url, title: url } });
    try {
      const meta = await api.post<any>('/unfurl', { url });
      update(it.id, { data: meta });
    } catch { /* keep raw url */ }
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
            (drag?.kind === 'pan' ? ' panning' : '')
          }
          style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${26 * view.k}px ${26 * view.k}px` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
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
          <button title="Pin a link" onClick={() => { haptic.tap(); addLink(); }}><Link2 size={20} /></button>
          <button title="Image" onClick={() => { haptic.tap(); fileRef.current?.click(); }}><ImagePlus size={20} /></button>
          <button
            title="Checklist"
            onClick={() => addItem({ type: 'todo', w: 240, h: 210, rotation: 0, color: 'white', data: { title: 'Checklist', items: [{ t: 'First task', d: false }] } })}
          >
            <CheckSquare size={20} />
          </button>
          <button
            title="Text label"
            onClick={() => addItem({ type: 'text', w: 260, h: 70, rotation: 0, data: { text: 'Heading' } })}
          >
            <Type size={20} />
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

        {showColors && selected && (
          <div className="board-toolbar" style={{ bottom: 86 }}>
            {Object.entries(STICKY_COLORS).map(([name, hex]) => (
              <button key={name} onClick={() => { update(selected.id, { color: name }); setShowColors(false); }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: hex, display: 'block' }} />
              </button>
            ))}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImage(e.target.files)} />
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
    return (
      <div className={cls('board-item link-card')} style={base} onPointerDown={(e) => onMoveStart(e, it)}>
        <div
          className="lc-thumb"
          style={it.data.image ? { backgroundImage: `url(${it.data.image})` } : undefined}
        />
        <div className="lc-body">
          <div className="lc-title">{it.data.title || host}</div>
          <div className="lc-host">
            {it.data.favicon && <img src={it.data.favicon} alt="" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} />}
            {host}
          </div>
        </div>
        <button
          className="btn primary sm"
          style={{ position: 'absolute', right: 8, bottom: 8, padding: '5px 11px', fontSize: 12 }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => window.open(it.data.url, '_blank', 'noopener')}
        >
          Open
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

  // text label
  return (
    <div
      className={cls('board-item')}
      style={{ ...base, background: 'transparent', border: selected ? undefined : '1px dashed transparent', boxShadow: 'none', padding: 4 }}
      onPointerDown={(e) => onMoveStart(e, it)}
    >
      <textarea
        value={it.data.text || ''}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => onChange(it.id, { data: { ...it.data, text: e.target.value } })}
        style={{ width: '100%', height: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontSize: 27, fontWeight: 750, letterSpacing: '-0.6px', color: 'var(--text)', fontFamily: 'inherit' }}
      />
      <div className="resize-handle" onPointerDown={(e) => onResizeStart(e, it)} />
    </div>
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
