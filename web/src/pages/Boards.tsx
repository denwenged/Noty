import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Infinity as InfinityIcon, Frame, X } from 'lucide-react';
import { api, CANVAS_PRESETS, type BoardSummary } from '../api';
import { useApp } from '../store';
import { STICKY_COLORS } from '../colors';
import { haptic } from '../lib/haptics';
import Sheet from '../lib/Sheet';

export default function Boards() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  const { toast } = useApp();

  useEffect(() => {
    api.get<BoardSummary[]>('/boards').then(setBoards).catch((e) => toast(e.message, 'err')).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="topbar">
        <h1>Whiteboards</h1>
        <div className="grow" />
        <button className="btn accent sm" onClick={() => { haptic.press(); setCreating(true); }}><Plus size={16} /> New board</button>
      </div>

      <div className="content">
        {loading ? (
          <div className="tile-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 176, ['--i' as any]: i }} />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <div className="empty">
            <div className="big">🧲</div>
            <h3>No boards yet</h3>
            <p>Spread sticky notes, links and images across an infinite canvas — or a fixed one sized to the pixel.</p>
            <button className="btn accent" style={{ marginTop: 18 }} onClick={() => setCreating(true)}>
              <Plus size={17} /> New board
            </button>
          </div>
        ) : (
          <div className="tile-grid">
            {boards.map((b, i) => (
              <div
                key={b.id}
                className="tile"
                style={{ ['--i' as any]: i }}
                onClick={() => { haptic.tap(); nav(`/boards/${b.id}`); }}
              >
                <div className={'board-thumb bg-' + b.background} style={{ backgroundSize: '13px 13px' }}>
                  {/* decorative mini stickies */}
                  <span style={{ position: 'absolute', left: 14, top: 18, width: 30, height: 30, borderRadius: 4, background: STICKY_COLORS.yellow, transform: 'rotate(-6deg)', boxShadow: '0 3px 8px -3px rgba(0,0,0,.4)' }} />
                  <span style={{ position: 'absolute', left: 48, top: 30, width: 30, height: 30, borderRadius: 4, background: STICKY_COLORS.mint, transform: 'rotate(4deg)', boxShadow: '0 3px 8px -3px rgba(0,0,0,.4)' }} />
                  <span style={{ position: 'absolute', left: 82, top: 16, width: 30, height: 30, borderRadius: 4, background: STICKY_COLORS.blush, transform: 'rotate(-3deg)', boxShadow: '0 3px 8px -3px rgba(0,0,0,.4)' }} />
                </div>
                <div className="tile-title">{b.name}</div>
                <div className="tile-sub row" style={{ gap: 6 }}>
                  {b.canvasMode === 'fixed' ? (
                    <><Frame size={12} /> {b.canvasW}×{b.canvasH}</>
                  ) : (
                    <><InfinityIcon size={13} /> Infinite</>
                  )}
                  <span>· {b.itemCount} item{b.itemCount === 1 ? '' : 's'}</span>
                </div>
                <button
                  className="btn icon ghost sm"
                  style={{ position: 'absolute', top: 8, right: 8 }}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Delete "${b.name}"?`)) return;
                    await api.del(`/boards/${b.id}`);
                    setBoards((x) => x.filter((y) => y.id !== b.id));
                    toast('Board deleted');
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && <NewBoard onClose={() => setCreating(false)} onCreated={(b) => nav(`/boards/${b.id}`)} />}
    </>
  );
}

function NewBoard({ onClose, onCreated }: { onClose: () => void; onCreated: (b: BoardSummary) => void }) {
  const [name, setName] = useState('Untitled board');
  const [mode, setMode] = useState<'infinite' | 'fixed'>('infinite');
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const b = await api.post<BoardSummary>('/boards', { name, canvasMode: mode, canvasW: w, canvasH: h });
      onCreated(b);
    } finally { setBusy(false); }
  };

  return (
    <Sheet onClose={onClose} maxWidth={440}>
      <>
        <div className="modal-head">
          <h2>New whiteboard</h2>
          <div className="grow" />
          <button className="btn icon ghost" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field" style={{ margin: 0 }}>
            <label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Canvas</label>
            <div className="seg" style={{ alignSelf: 'flex-start' }}>
              <button className={mode === 'infinite' ? 'on' : ''} onClick={() => setMode('infinite')}>Infinite</button>
              <button className={mode === 'fixed' ? 'on' : ''} onClick={() => setMode('fixed')}>Fixed size</button>
            </div>
          </div>

          {mode === 'fixed' && (
            <>
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
          <button className="btn primary sm" onClick={create} disabled={busy}>
            {busy ? <div className="spinner" /> : <Plus size={15} />} Create
          </button>
        </div>
      </>
    </Sheet>
  );
}
