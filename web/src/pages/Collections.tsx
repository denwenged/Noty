import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Users, FolderOpen, X } from 'lucide-react';
import { api, type Collection } from '../api';
import { useApp } from '../store';
import { STICKY_COLORS } from '../colors';
import { haptic } from '../lib/haptics';
import Sheet from '../lib/Sheet';

export default function Collections() {
  const [cols, setCols] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  const { toast } = useApp();

  const load = () =>
    api
      .get<Collection[]>('/collections')
      .then(setCols)
      .catch((e) => toast(e.message, 'err'))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const remove = async (c: Collection, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${c.name}"? The notes inside are kept.`)) return;
    haptic.warn();
    try {
      await api.del(`/collections/${c.id}`);
      setCols((x) => x.filter((y) => y.id !== c.id));
      toast('Collection deleted — notes kept');
    } catch (err: any) { toast(err.message, 'err'); }
  };

  return (
    <>
      <div className="topbar">
        <h1>Collections</h1>
        <div className="grow" />
        <button className="btn accent sm" onClick={() => { haptic.press(); setCreating(true); }}>
          <Plus size={16} /> New collection
        </button>
      </div>

      <div className="content">
        {loading ? (
          <div className="tile-grid">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 150, ['--i' as any]: i }} />
            ))}
          </div>
        ) : cols.length === 0 ? (
          <div className="empty">
            <div className="big">🗂️</div>
            <h3>No collections yet</h3>
            <p>Group related notes together, then invite people to write in them with you.</p>
            <button className="btn accent" style={{ marginTop: 18 }} onClick={() => setCreating(true)}>
              <Plus size={17} /> New collection
            </button>
          </div>
        ) : (
          <div className="tile-grid">
            {cols.map((c, i) => (
              <div
                key={c.id}
                className="tile col-tile"
                style={{ ['--i' as any]: i }}
                onClick={() => nav(`/collections/${c.id}`)}
              >
                <div className="col-swatch" style={{ background: STICKY_COLORS[c.color] || STICKY_COLORS.violet }}>
                  <FolderOpen size={22} />
                </div>
                <div className="tile-title">{c.name}</div>
                <div className="tile-sub">
                  {c.noteCount} {c.noteCount === 1 ? 'note' : 'notes'}
                  {c.memberCount > 1 && (
                    <> · <Users size={12} style={{ verticalAlign: -2 }} /> {c.memberCount}</>
                  )}
                </div>
                {c.shared && <span className="role-chip float">{c.role}</span>}
                {c.role === 'owner' && (
                  <button className="tile-del" title="Delete collection" onClick={(e) => remove(c, e)}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <NewCollection
          onClose={() => setCreating(false)}
          onCreated={(c) => { setCols((x) => [c, ...x]); setCreating(false); nav(`/collections/${c.id}`); }}
        />
      )}
    </>
  );
}

function NewCollection({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Collection) => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('violet');
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await api.post<Collection>('/collections', { name: name.trim(), color });
      haptic.success();
      onCreated(c);
    } catch (e: any) { toast(e.message, 'err'); setBusy(false); }
  };

  return (
    <Sheet onClose={onClose} maxWidth={420}>
      <h3 style={{ margin: '0 0 14px', fontFamily: 'var(--font-display)' }}>New collection</h3>
      <input
        className="input no-drag"
        autoFocus
        placeholder="Collection name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && create()}
      />
      <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {Object.entries(STICKY_COLORS).map(([n, hex]) => (
          <button
            key={n}
            className="swatch-btn"
            onClick={() => { haptic.tap(); setColor(n); }}
            style={{ background: hex, outline: color === n ? '2.5px solid var(--accent)' : 'none', outlineOffset: 2 }}
          />
        ))}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 18 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <div className="grow" />
        <button className="btn primary" disabled={!name.trim() || busy} onClick={create}>Create</button>
      </div>
    </Sheet>
  );
}

/** Invite people to a collection. Shared with the detail page. */
export function CollectionPeople({
  collectionId, onClose,
}: { collectionId: number; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { toast } = useApp();

  const load = () =>
    api.get<any>(`/collections/${collectionId}/collaborators`).then(setData).catch(() => {});
  useEffect(() => { load(); }, [collectionId]);

  const invite = async () => {
    const u = name.trim();
    if (!u) return;
    setBusy(true); setErr('');
    try {
      await api.post(`/collections/${collectionId}/collaborators`, { username: u, role });
      setName('');
      haptic.success();
      toast(`${u} can now ${role === 'editor' ? 'edit' : 'read'} this collection`);
      load();
    } catch (e: any) { setErr(e.message || 'Could not invite that user'); }
    finally { setBusy(false); }
  };

  const remove = async (userId: number, username: string) => {
    await api.del(`/collections/${collectionId}/collaborators/${userId}`);
    toast(`Removed ${username}`);
    load();
  };

  return (
    <Sheet onClose={onClose} maxWidth={420}>
      <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>Share collection</h3>
      <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>
        Editors can add notes and edit everything inside. Viewers can only read.
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
            <select
              className="input no-drag"
              style={{ maxWidth: 108 }}
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
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
          </div>
        )}
        {data?.collaborators?.map((c: any) => (
          <div className="person" key={c.id}>
            <span className="pav lg" style={{ background: '#8a8f98' }}>
              {c.username.charAt(0).toUpperCase()}
            </span>
            <div className="grow">
              <div style={{ fontWeight: 650 }}>{c.username}</div>
              <div className="muted" style={{ fontSize: 12 }}>{c.role}</div>
            </div>
            {data.isOwner && (
              <button className="btn icon ghost sm" title="Remove" onClick={() => remove(c.id, c.username)}>
                <X size={16} />
              </button>
            )}
          </div>
        ))}
        {data && !data.collaborators?.length && (
          <div className="muted" style={{ fontSize: 13, padding: '10px 2px' }}>
            {data.isOwner ? 'Not shared with anyone yet.' : 'Only you and the owner have access.'}
          </div>
        )}
      </div>
    </Sheet>
  );
}
