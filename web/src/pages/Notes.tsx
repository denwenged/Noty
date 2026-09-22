import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Pin, PinOff, Archive, Trash2, Share2, ImagePlus, X, Plus, Check, Link2,
  ArchiveRestore, RotateCcw, Copy, Search, ExternalLink,
} from 'lucide-react';
import { api, uploadImage, type Note, type NoteLink } from '../api';
import { useApp } from '../store';
import { NOTE_COLORS, noteBg, noteBorder, faviconFor, hostOf } from '../colors';
import { haptic } from '../lib/haptics';
import { useIsPhone } from '../lib/gestures';
import Sheet from '../lib/Sheet';

type View = 'all' | 'pinned' | 'archive' | 'trash';

export default function Notes({ view = 'all' }: { view?: View }) {
  const { toast, user } = useApp();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Note | null>(null);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const tagFilter = params.get('tag') || '';
  const theme = user?.theme || 'light';
  const phone = useIsPhone();
  const scroller = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStart = useRef<number | null>(null);

  const load = () =>
    api.get<Note[]>('/notes').then(setNotes).catch((e) => toast(e.message, 'err')).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (params.get('new') === '1') {
      create();
      params.delete('new');
      setParams(params, { replace: true });
    }
    const open = params.get('open');
    if (open && notes.length) {
      const n = notes.find((x) => x.id === Number(open));
      if (n) setEditing(n);
      params.delete('open');
      setParams(params, { replace: true });
    }
  }, [params, notes]);

  const filtered = useMemo(() => {
    let list = notes.filter((n) =>
      view === 'trash' ? n.trashed
      : view === 'archive' ? n.archived && !n.trashed
      : view === 'pinned' ? n.pinned && !n.archived && !n.trashed
      : !n.archived && !n.trashed
    );
    if (tagFilter) list = list.filter((n) => n.tags.includes(tagFilter));
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(s) ||
          n.content.toLowerCase().includes(s) ||
          n.tags.some((t) => t.toLowerCase().includes(s)) ||
          n.links.some((l) => (l.title || '').toLowerCase().includes(s) || l.url.toLowerCase().includes(s))
      );
    }
    return list;
  }, [notes, view, q, tagFilter]);

  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    notes.filter((n) => !n.trashed && !n.archived).forEach((n) => n.tags.forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [notes]);

  async function create() {
    haptic.press();
    const n = await api.post<Note>('/notes', { title: '', content: '' });
    setNotes((x) => [n, ...x]);
    setEditing(n);
  }

  async function patch(id: number, body: Partial<Note>) {
    const updated = await api.patch<Note>(`/notes/${id}`, body);
    setNotes((x) => x.map((n) => (n.id === id ? updated : n)));
    setEditing((e) => (e && e.id === id ? updated : e));
    return updated;
  }

  async function remove(id: number) {
    haptic.warn();
    await api.del(`/notes/${id}`);
    setNotes((x) => x.filter((n) => n.id !== id));
    toast('Deleted forever');
  }

  const title = view === 'trash' ? 'Trash' : view === 'archive' ? 'Archive' : view === 'pinned' ? 'Pinned' : 'Notes';

  return (
    <>
      <div className="topbar">
        <h1 style={{ flexShrink: 0 }}>{title}</h1>
        <div className="search-box" style={{ marginLeft: 'auto' }}>
          <Search size={17} />
          <input
            className="input"
            placeholder="Filter…"
            value={q}
            onChange={(e) => {
              const p = new URLSearchParams(params);
              e.target.value ? p.set('q', e.target.value) : p.delete('q');
              setParams(p, { replace: true });
            }}
          />
        </div>
        {view === 'trash' && filtered.length > 0 && (
          <button className="btn danger sm" onClick={async () => { await api.post('/notes/empty-trash'); load(); toast('Trash emptied'); }}>
            Empty
          </button>
        )}
      </div>

      <div
        className="content"
        ref={scroller}
        style={{ position: 'relative' }}
        onPointerDown={(e) => {
          if (!phone || e.pointerType === 'mouse') return;
          if ((scroller.current?.scrollTop ?? 0) <= 0) pullStart.current = e.clientY;
        }}
        onPointerMove={(e) => {
          if (pullStart.current === null) return;
          const dy = e.clientY - pullStart.current;
          if (dy > 0 && (scroller.current?.scrollTop ?? 0) <= 0) {
            setPull(Math.min(90, dy * 0.45));
          } else {
            pullStart.current = null;
            setPull(0);
          }
        }}
        onPointerUp={async () => {
          if (pull > 56) {
            haptic.success();
            setRefreshing(true);
            setPull(44);
            await load();
            setRefreshing(false);
          }
          setPull(0);
          pullStart.current = null;
        }}
        onPointerCancel={() => { setPull(0); pullStart.current = null; }}
      >
        {(pull > 0 || refreshing) && (
          <div
            className="ptr"
            style={{
              transform: `translate(-50%, ${pull - 6}px) rotate(${pull * 4}deg)`,
              opacity: Math.min(1, pull / 40),
            }}
          >
            <RotateCcw size={17} className={refreshing ? 'spin-now' : ''} />
          </div>
        )}
        {tagFilter && (
          <div className="row" style={{ marginBottom: 16 }}>
            <span className="chip solid">#{tagFilter}</span>
            <button className="btn ghost sm" onClick={() => { params.delete('tag'); setParams(params); }}>Clear</button>
          </div>
        )}

        {!tagFilter && view === 'all' && allTags.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
            {allTags.slice(0, 14).map(([t, c]) => (
              <button key={t} className="chip" onClick={() => { params.set('tag', t); setParams(params); }}>
                #{t} <span style={{ opacity: .55 }}>{c}</span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="notes-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 150 + (i % 3) * 46, ['--i' as any]: i }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="big">{view === 'trash' ? '🗑️' : view === 'archive' ? '📦' : '🌱'}</div>
            <h3>{q ? 'Nothing matches' : view === 'all' ? 'A blank slate' : `${title} is empty`}</h3>
            <p>{view === 'all' && !q ? 'Write your first note — add images, links and tags as you go.' : ''}</p>
          </div>
        ) : (
          <div className="notes-grid">
            {filtered.map((n, i) => (
              <NoteCard
                key={n.id}
                n={n}
                i={i}
                view={view}
                theme={theme}
                phone={phone}
                onOpen={() => setEditing(n)}
                onPatch={patch}
                onRemove={remove}
              />
            ))}
          </div>
        )}
      </div>

      {view !== 'trash' && view !== 'archive' && (
        <button className="fab" onClick={create} title="New note (N)" aria-label="New note"><Plus size={25} /></button>
      )}

      {editing && (
        <Editor
          note={editing}
          onClose={() => setEditing(null)}
          onChange={patch}
          onDelete={async (id) => { await patch(id, { trashed: true }); setEditing(null); toast('Moved to trash'); }}
        />
      )}
    </>
  );
}

function NoteCard({
  n, i, view, theme, phone, onOpen, onPatch, onRemove,
}: {
  n: Note;
  i: number;
  view: View;
  theme: string;
  phone: boolean;
  onOpen: () => void;
  onPatch: (id: number, b: Partial<Note>) => Promise<Note>;
  onRemove: (id: number) => void;
}) {
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'x' | 'y' | null>(null);
  const armed = useRef(false);

  const trashed = view === 'trash';
  const THRESHOLD = 96;

  const firstImage = (c: string) => c.match(/!\[[^\]]*\]\((\/api\/files\/[^)]+)\)/)?.[1];
  const stripImages = (c: string) => c.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
  const img = firstImage(n.content);
  const body = stripImages(n.content);

  // swipe right = pin (or restore in trash), swipe left = archive (or delete in trash)
  const rightLabel = trashed ? 'Restore' : n.pinned ? 'Unpin' : 'Pin';
  const leftLabel = trashed ? 'Delete' : n.archived ? 'Unarchive' : 'Archive';

  const onDown = (e: React.PointerEvent) => {
    if (!phone || e.pointerType === 'mouse') return;
    if ((e.target as HTMLElement).closest('a, button')) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = null;
    armed.current = false;
  };

  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const ddx = e.clientX - start.current.x;
    const ddy = e.clientY - start.current.y;
    if (!axis.current) {
      if (Math.abs(ddx) > 10 || Math.abs(ddy) > 10)
        axis.current = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y';
      else return;
    }
    if (axis.current !== 'x') return;
    e.preventDefault();
    setDx(ddx);
    if (!armed.current && Math.abs(ddx) > THRESHOLD) {
      armed.current = true;
      haptic.tap();
    } else if (armed.current && Math.abs(ddx) < THRESHOLD) {
      armed.current = false;
    }
  };

  const onUp = async () => {
    const d = dx;
    start.current = null;
    axis.current = null;
    if (Math.abs(d) > THRESHOLD) {
      haptic.success();
      if (d > 0) {
        if (trashed) { setGone(true); await onPatch(n.id, { trashed: false }); }
        else await onPatch(n.id, { pinned: !n.pinned });
        setDx(0);
      } else {
        setGone(true);
        setTimeout(async () => {
          if (trashed) onRemove(n.id);
          else await onPatch(n.id, { archived: !n.archived });
        }, 170);
        return;
      }
    } else {
      setDx(0);
    }
  };

  const progress = Math.min(1, Math.abs(dx) / THRESHOLD);

  return (
    <div className="swipe-wrap" style={{ ['--i' as any]: i }}>
      {phone && dx !== 0 && (
        <div
          className="swipe-actions"
          style={{
            justifyContent: dx > 0 ? 'flex-start' : 'flex-end',
            background:
              dx > 0
                ? 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 24%, transparent), transparent)'
                : 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 24%, transparent))',
          }}
        >
          <div className="sa-icon" style={{ ['--sa-scale' as any]: 0.7 + progress * 0.45 }}>
            {dx > 0
              ? (trashed ? <RotateCcw size={18} /> : n.pinned ? <PinOff size={18} /> : <Pin size={18} />)
              : (trashed ? <Trash2 size={18} /> : n.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />)}
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-dim)' }}>
            {dx > 0 ? rightLabel : leftLabel}
          </span>
        </div>
      )}

      <article
        className="note-card"
        style={{
          ['--note-bg' as any]: noteBg(n.color, theme),
          ['--note-br' as any]: noteBorder(n.color, theme),
          transform: gone
            ? `translateX(${dx < 0 ? -120 : 120}%) scale(.85)`
            : dx
              ? `translateX(${dx}px) rotate(${dx * 0.012}deg)`
              : undefined,
          opacity: gone ? 0 : 1,
          transition: dx && !gone ? 'none' : 'transform .32s var(--ease), opacity .3s',
          animationDelay: `${Math.min(i, 12) * 32}ms`,
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => { setDx(0); start.current = null; }}
        onClick={() => { if (Math.abs(dx) < 6) { haptic.tap(); onOpen(); } }}
      >
        {img && <img className="note-img" src={img + '?thumb=1'} alt="" loading="lazy" />}
        <div className="note-actions" onClick={(e) => e.stopPropagation()}>
          {!trashed ? (
            <>
              <button className="btn icon ghost sm" title="Pin" onClick={() => { haptic.tap(); onPatch(n.id, { pinned: !n.pinned }); }}>
                {n.pinned ? <PinOff size={15} /> : <Pin size={15} />}
              </button>
              <button className="btn icon ghost sm" title="Archive" onClick={() => { haptic.tap(); onPatch(n.id, { archived: !n.archived }); }}>
                {n.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              </button>
              <button className="btn icon ghost sm" title="Trash" onClick={() => { haptic.warn(); onPatch(n.id, { trashed: true }); }}>
                <Trash2 size={15} />
              </button>
            </>
          ) : (
            <>
              <button className="btn icon ghost sm" title="Restore" onClick={() => { haptic.tap(); onPatch(n.id, { trashed: false }); }}>
                <RotateCcw size={15} />
              </button>
              <button className="btn icon ghost sm" title="Delete forever" onClick={() => onRemove(n.id)}>
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>

        {n.pinned && !trashed && <Pin size={13} style={{ color: 'var(--accent)', marginBottom: 6 }} />}
        {n.title && <h3>{n.title}</h3>}
        {body && <p>{body}</p>}

        {n.links.length > 0 && (
          <div className="note-links">
            {n.links.slice(0, 2).map((l, j) => (
              <a key={j} className="link-pill" href={l.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}>
                <img src={l.favicon || faviconFor(l.url)} alt="" onError={(e) => ((e.target as HTMLElement).style.visibility = 'hidden')} />
                <div className="lp-text">
                  <div className="lp-title">{l.title || hostOf(l.url)}</div>
                  <div className="lp-host">{hostOf(l.url)}</div>
                </div>
                <ExternalLink size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              </a>
            ))}
            {n.links.length > 2 && (
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', paddingLeft: 4 }}>
                +{n.links.length - 2} more link{n.links.length - 2 > 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        <div className="note-meta">
          {n.tags.slice(0, 3).map((t) => <span className="chip" key={t}>#{t}</span>)}
          <span style={{ marginLeft: 'auto' }}>
            {new Date(n.updatedAt + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </article>
    </div>
  );
}

function Editor({
  note, onClose, onChange, onDelete,
}: {
  note: Note;
  onClose: () => void;
  onChange: (id: number, b: Partial<Note>) => Promise<Note>;
  onDelete: (id: number) => void;
}) {
  const { toast, user } = useApp();
  const theme = user?.theme || 'light';
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [links, setLinks] = useState<NoteLink[]>(note.links);
  const [color, setColor] = useState(note.color);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<any>(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (
      title === note.title && content === note.content && color === note.color &&
      JSON.stringify(tags) === JSON.stringify(note.tags) &&
      JSON.stringify(links) === JSON.stringify(note.links)
    ) return;
    setSaving(true);
    timer.current = setTimeout(async () => {
      await onChange(note.id, { title, content, tags, color, links });
      setSaving(false);
    }, 550);
    return () => clearTimeout(timer.current);
  }, [title, content, tags, color, links]);

  async function doUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const r = await uploadImage(f);
        setContent((c) => (c ? c + '\n\n' : '') + `![image](${r.url})`);
      }
      haptic.success();
      toast('Image added');
    } catch (e: any) { toast(e.message, 'err'); }
    setUploading(false);
  }

  async function attachLink(raw: string) {
    let url = raw.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    setLinks((l) => [...l, { url, title: hostOf(url), favicon: faviconFor(url) }]);
    setAddingLink(false);
    haptic.success();
    try {
      const meta = await api.post<NoteLink>('/unfurl', { url });
      setLinks((l) => l.map((x) => (x.url === url ? { ...x, ...meta } : x)));
    } catch { /* keep the basic pill */ }
  }

  const images = [...content.matchAll(/!\[[^\]]*\]\((\/api\/files\/[^)]+)\)/g)].map((m) => m[1]);

  async function share() {
    const r = await api.post<{ path: string }>('/shares', { type: 'note', id: note.id });
    const url = location.origin + r.path;
    try { await navigator.clipboard.writeText(url); haptic.success(); toast('Share link copied'); }
    catch { prompt('Share link:', url); }
  }

  return (
    <Sheet
      onClose={onClose}
      style={{
        ['--modal-bg' as any]: noteBg(color, theme),
        borderColor: noteBorder(color, theme),
      }}
    >
      <>
        <div className="modal-head">
          <input
            className="input"
            style={{ border: 'none', background: 'transparent', fontSize: 20, fontWeight: 700, padding: '4px 0', fontFamily: 'var(--font-display)' }}
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus={!note.title && !note.content}
          />
          {saving && <div className="spinner" />}
          <button className="btn icon ghost" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          <textarea
            className="textarea"
            style={{ minHeight: 170, border: 'none', background: 'transparent', padding: 0, fontSize: 15.5 }}
            placeholder="Start writing…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={(e) => {
              const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
              if (imgs.length) { e.preventDefault(); doUpload(e.clipboardData.files); return; }
              const text = e.clipboardData.getData('text');
              if (/^https?:\/\/\S+$/i.test(text.trim()) && !content.trim()) {
                e.preventDefault();
                attachLink(text.trim());
              }
            }}
          />

          {images.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(128px,1fr))', gap: 10 }}>
              {images.map((src) => (
                <div key={src} style={{ position: 'relative' }}>
                  <img src={src + '?thumb=1'} style={{ width: '100%', borderRadius: 13, display: 'block' }} />
                  <button
                    className="btn icon sm"
                    style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none' }}
                    onClick={() => setContent((c) => c.replace(new RegExp(`!\\[[^\\]]*\\]\\(${src}\\)\\n*`), ''))}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {links.length > 0 && (
            <div className="note-links">
              {links.map((l, i) => (
                <div key={i} className="link-pill">
                  {l.image ? (
                    <img src={l.image} alt="" style={{ width: 34, height: 34, objectFit: 'cover' }} />
                  ) : (
                    <img src={l.favicon || faviconFor(l.url)} alt="" onError={(e) => ((e.target as HTMLElement).style.visibility = 'hidden')} />
                  )}
                  <div className="lp-text">
                    <div className="lp-title">{l.title || hostOf(l.url)}</div>
                    <div className="lp-host">{hostOf(l.url)}</div>
                  </div>
                  <a className="btn icon ghost sm" href={l.url} target="_blank" rel="noopener"><ExternalLink size={14} /></a>
                  <button className="btn icon ghost sm" onClick={() => setLinks(links.filter((_, j) => j !== i))}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {addingLink && (
            <input
              className="input"
              autoFocus
              placeholder="Paste a URL and press Enter"
              onKeyDown={(e) => {
                if (e.key === 'Enter') attachLink((e.target as HTMLInputElement).value);
                if (e.key === 'Escape') setAddingLink(false);
              }}
              onBlur={(e) => (e.target.value ? attachLink(e.target.value) : setAddingLink(false))}
            />
          )}

          <div className="row" style={{ flexWrap: 'wrap', gap: 7 }}>
            {tags.map((t) => (
              <span className="chip" key={t}>
                #{t}
                <button onClick={() => setTags(tags.filter((x) => x !== t))} style={{ display: 'grid' }}><X size={11} /></button>
              </span>
            ))}
            <input
              className="input"
              style={{ width: 124, padding: '5px 12px', fontSize: 13, borderRadius: 999 }}
              placeholder="+ tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                  e.preventDefault();
                  if (!tags.includes(tagInput.trim())) setTags([...tags, tagInput.trim()]);
                  setTagInput('');
                }
              }}
            />
          </div>

          <div className="note-colors">
            {Object.keys(NOTE_COLORS).map((c) => (
              <button
                key={c}
                className={'swatch ' + (color === c ? 'on' : '')}
                title={NOTE_COLORS[c].label}
                style={{ background: noteBg(c, theme), borderColor: color === c ? undefined : noteBorder(c, theme) }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="modal-foot">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => doUpload(e.target.files)} />
          <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <div className="spinner" /> : <ImagePlus size={15} />} Image
          </button>
          <button className="btn sm" onClick={() => setAddingLink(true)}><Link2 size={15} /> Link</button>
          <button className="btn icon sm" title="Share" onClick={share}><Share2 size={15} /></button>
          <button className="btn icon sm" title="Copy text" onClick={() => { navigator.clipboard.writeText(content); toast('Copied'); }}>
            <Copy size={15} />
          </button>
          <div className="grow" />
          <button className="btn icon sm danger" onClick={() => onDelete(note.id)}><Trash2 size={15} /></button>
          <button className="btn primary sm" onClick={onClose}><Check size={15} /> Done</button>
        </div>
      </>
    </Sheet>
  );
}
