import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Users, X, Search, Eye } from 'lucide-react';
import { api, type CollectionDetail, type Note } from '../api';
import { useApp } from '../store';
import { noteBg, noteBorder } from '../colors';
import { haptic } from '../lib/haptics';
import Sheet from '../lib/Sheet';
import { CollectionPeople } from './Collections';

export default function CollectionView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast, user } = useApp();
  const [col, setCol] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [people, setPeople] = useState(false);
  const theme = user?.theme || 'light';

  const load = () =>
    api
      .get<CollectionDetail>(`/collections/${id}`)
      .then(setCol)
      .catch((e) => { toast(e.message, 'err'); nav('/collections'); })
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, [id]);

  const canEdit = col?.role === 'owner' || col?.role === 'editor';

  const removeNote = async (noteId: number) => {
    haptic.warn();
    setCol((c) => (c ? { ...c, notes: c.notes.filter((n) => n.id !== noteId) } : c));
    try { await api.del(`/collections/${id}/notes/${noteId}`); }
    catch (e: any) { toast(e.message, 'err'); load(); }
  };

  const rename = async (name: string) => {
    setCol((c) => (c ? { ...c, name } : c));
    try { await api.patch(`/collections/${id}`, { name }); }
    catch (e: any) { toast(e.message, 'err'); }
  };

  if (loading) return <div className="content"><div className="skeleton" style={{ height: 160 }} /></div>;
  if (!col) return null;

  return (
    <>
      <div className="topbar">
        <button className="btn icon ghost" onClick={() => nav('/collections')}><ArrowLeft size={19} /></button>
        <input
          className="input"
          style={{ border: 'none', background: 'transparent', fontSize: 19, fontWeight: 700, maxWidth: 320 }}
          value={col.name}
          readOnly={!canEdit}
          onChange={(e) => rename(e.target.value)}
        />
        {col.shared && <span className="role-chip">{col.role}</span>}
        <div className="grow" />
        <button className="btn icon ghost" title="Share collection" onClick={() => { haptic.tap(); setPeople(true); }}>
          <Users size={18} />
        </button>
        {canEdit && (
          <button className="btn accent sm" onClick={() => { haptic.press(); setAdding(true); }}>
            <Plus size={16} /> Add notes
          </button>
        )}
      </div>

      <div className="content">
        {!canEdit && (
          <div className="readonly-banner">
            <Eye size={15} /> You have read-only access to this collection.
          </div>
        )}

        {col.notes.length === 0 ? (
          <div className="empty">
            <div className="big">🗂️</div>
            <h3>Nothing in here yet</h3>
            <p>{canEdit ? 'Add notes to gather them in one place.' : 'The owner has not added any notes yet.'}</p>
            {canEdit && (
              <button className="btn accent" style={{ marginTop: 18 }} onClick={() => setAdding(true)}>
                <Plus size={17} /> Add notes
              </button>
            )}
          </div>
        ) : (
          <div className="notes-grid">
            {col.notes.map((n, i) => (
              <div
                key={n.id}
                className="note-card"
                style={{
                  ['--note-bg' as any]: noteBg(n.color, theme),
                  ['--note-br' as any]: noteBorder(n.color, theme),
                  ['--i' as any]: i,
                }}
                onClick={() => nav(`/notes?open=${n.id}`)}
              >
                <h3>{n.title || 'Untitled'}</h3>
                {n.content && <p>{n.content}</p>}
                {n.ownerId != null && n.ownerId !== user?.id && (
                  <div className="note-meta"><span className="role-chip sm">shared note</span></div>
                )}
                {canEdit && (
                  <div className="note-actions">
                    <button
                      className="btn icon ghost sm"
                      title="Remove from collection (keeps the note)"
                      onClick={(e) => { e.stopPropagation(); removeNote(n.id); }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {adding && (
        <AddNotes
          collectionId={col.id}
          already={col.notes.map((n) => n.id)}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); load(); }}
        />
      )}
      {people && <CollectionPeople collectionId={col.id} onClose={() => { setPeople(false); load(); }} />}
    </>
  );
}

/** Pick notes to drop into the collection. */
function AddNotes({
  collectionId, already, onClose, onAdded,
}: { collectionId: number; already: number[]; onClose: () => void; onAdded: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();

  useEffect(() => {
    api.get<Note[]>('/notes').then((all) => setNotes(all.filter((n) => !n.trashed))).catch(() => {});
  }, []);

  const available = useMemo(() => {
    const list = notes.filter((n) => !already.includes(n.id));
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((n) => n.title.toLowerCase().includes(s) || n.content.toLowerCase().includes(s));
  }, [notes, already, q]);

  const save = async () => {
    setBusy(true);
    try {
      // Sequential keeps ordering predictable and errors attributable.
      for (const noteId of picked) {
        await api.post(`/collections/${collectionId}/notes`, { noteId });
      }
      haptic.success();
      toast(`Added ${picked.length} ${picked.length === 1 ? 'note' : 'notes'}`);
      onAdded();
    } catch (e: any) { toast(e.message, 'err'); setBusy(false); }
  };

  return (
    <Sheet onClose={onClose} maxWidth={460}>
      <h3 style={{ margin: '0 0 12px', fontFamily: 'var(--font-display)' }}>Add notes</h3>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <Search size={16} style={{ color: 'var(--text-faint)' }} />
        <input
          className="input no-drag"
          autoFocus
          placeholder="Search your notes"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="pick-list">
        {available.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: '14px 2px' }}>
            {notes.length ? 'Every note is already in this collection.' : 'No notes yet.'}
          </div>
        ) : (
          available.map((n) => {
            const on = picked.includes(n.id);
            return (
              <button
                key={n.id}
                className={'pick-row' + (on ? ' on' : '')}
                onClick={() => {
                  haptic.tap();
                  setPicked((p) => (on ? p.filter((x) => x !== n.id) : [...p, n.id]));
                }}
              >
                <span className={'pick-box' + (on ? ' on' : '')} />
                <span className="grow" style={{ textAlign: 'left', minWidth: 0 }}>
                  <span style={{ fontWeight: 650, display: 'block' }}>{n.title || 'Untitled'}</span>
                  {n.content && <span className="pick-sub">{n.content.slice(0, 70)}</span>}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <div className="grow" />
        <button className="btn primary" disabled={!picked.length || busy} onClick={save}>
          {busy ? 'Adding…' : `Add ${picked.length || ''}`.trim()}
        </button>
      </div>
    </Sheet>
  );
}
