import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  StickyNote, LayoutDashboard, Link2, Plus, Settings, Search, ArrowRight, Moon,
  FolderOpen,
} from 'lucide-react';
import { api } from './api';
import { useApp } from './store';

type Row = { icon: any; label: string; hint?: string; run: () => void };

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any>({ notes: [], boards: [], collections: [], links: [] });
  const [i, setI] = useState(0);
  const nav = useNavigate();
  const { updateUser, user } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!q.trim()) return setRes({ notes: [], boards: [], collections: [], links: [] });
    const t = setTimeout(() => {
      api.get(`/search?q=${encodeURIComponent(q)}`).then(setRes).catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const rows = useMemo<Row[]>(() => {
    const go = (p: string) => () => { nav(p); onClose(); };
    const base: Row[] = [
      { icon: Plus, label: 'New note', hint: 'N', run: go('/notes?new=1') },
      { icon: FolderOpen, label: 'Collections', hint: 'G C', run: go('/collections') },
      { icon: LayoutDashboard, label: 'Whiteboards', hint: 'G B', run: go('/boards') },
      { icon: StickyNote, label: 'All notes', hint: 'G N', run: go('/notes') },
      { icon: Settings, label: 'Settings', hint: 'G P', run: go('/settings') },
      {
        icon: Moon, label: 'Toggle theme', run: () => { updateUser({ theme: user?.theme === 'light' ? 'dark' : 'light' }); onClose(); },
      },
    ];
    const found: Row[] = [
      ...res.notes.map((n: any) => ({
        icon: StickyNote, label: n.title || n.content.slice(0, 50) || 'Untitled', hint: 'note',
        run: go(`/notes?open=${n.id}`),
      })),
      ...res.boards.map((b: any) => ({ icon: LayoutDashboard, label: b.name, hint: 'board', run: go(`/boards/${b.id}`) })),
      ...(res.collections || []).map((c: any) => ({
        icon: FolderOpen, label: c.name, hint: 'collection', run: go(`/collections/${c.id}`),
      })),
      ...res.links.map((l: any) => ({
        icon: Link2,
        label: l.title || l.url,
        hint: l.noteTitle ? `in ${l.noteTitle}` : 'link',
        run: () => { window.open(l.url, '_blank'); onClose(); },
      })),
    ];
    if (!q.trim()) return base;
    const filteredBase = base.filter((b) => b.label.toLowerCase().includes(q.toLowerCase()));
    const rows = [...found, ...filteredBase];
    if (/^https?:\/\//i.test(q))
      rows.unshift({
        icon: ArrowRight,
        label: 'Save this link to a new note',
        run: async () => {
          let meta: any = { url: q, title: q };
          try { meta = await api.post('/unfurl', { url: q }); } catch { /* offline fallback */ }
          const n = await api.post<any>('/notes', { title: meta.title || q, links: [meta] });
          nav(`/notes?open=${n.id}`);
          onClose();
        },
      });
    return rows;
  }, [q, res, user]);

  useEffect(() => { setI(0); }, [q]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk">
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 18 }}>
          <Search size={19} style={{ color: 'var(--text-faint)' }} />
          <input
            ref={inputRef}
            placeholder="Search notes, collections, boards… or type a command"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(x + 1, rows.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
              if (e.key === 'Enter') rows[i]?.run();
            }}
          />
        </div>
        <div className="results">
          {rows.length === 0 ? (
            <div style={{ padding: 22, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>No results</div>
          ) : (
            rows.map((r, idx) => (
              <div key={idx} className={'res' + (idx === i ? ' sel' : '')} onMouseEnter={() => setI(idx)} onClick={r.run}>
                <r.icon size={17} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                {r.hint && <span className="hint">{r.hint}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
