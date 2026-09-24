/**
 * Collections: named groups of notes that can be shared with other users.
 *
 * Access model (mirrors boards):
 *   - owner            full control, including inviting and deleting
 *   - editor           may read, add/remove notes, and edit notes inside
 *   - viewer           read only
 *
 * A note stays owned by whoever created it; putting it in a shared collection
 * grants the collection's members access to that note through the collection.
 */
import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

const r = Router();
r.use(requireAuth);

const shapeNote = (n) => ({
  id: n.id,
  title: n.title,
  content: n.content,
  color: n.color,
  icon: n.icon,
  pinned: !!n.pinned,
  archived: !!n.archived,
  trashed: !!n.trashed,
  tags: JSON.parse(n.tags || '[]'),
  links: JSON.parse(n.links || '[]'),
  reminderAt: n.reminder_at,
  createdAt: n.created_at,
  updatedAt: n.updated_at,
  ownerId: n.user_id,
});

/** Collection the user owns. */
const owned = (req, id) =>
  db.prepare('SELECT * FROM collections WHERE id=? AND user_id=?').get(id, req.user.id);

/** Collection the user owns or was invited to, with the caller's role attached. */
export function reachable(req, id) {
  const row = db
    .prepare(
      `SELECT c.*, CASE WHEN c.user_id = ? THEN 'owner' ELSE cc.role END AS my_role
       FROM collections c
       LEFT JOIN collection_collaborators cc ON cc.collection_id = c.id AND cc.user_id = ?
       WHERE c.id = ? AND (c.user_id = ? OR cc.user_id IS NOT NULL)`
    )
    .get(req.user.id, req.user.id, id, req.user.id);
  return row || null;
}

const canWrite = (c) => c && (c.my_role === 'owner' || c.my_role === 'editor');

const shape = (c, req) => ({
  id: c.id,
  name: c.name,
  color: c.color,
  icon: c.icon,
  ownerId: c.user_id,
  role: c.my_role || (c.user_id === req.user.id ? 'owner' : 'viewer'),
  shared: c.user_id !== req.user.id,
  noteCount: db.prepare('SELECT COUNT(*) n FROM collection_notes WHERE collection_id=?').get(c.id).n,
  memberCount:
    db.prepare('SELECT COUNT(*) n FROM collection_collaborators WHERE collection_id=?').get(c.id).n + 1,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
});

/**
 * Which collections a given note sits in, limited to ones the caller can see.
 * Lets the note editor show current membership instead of guessing.
 */
r.get('/for-note/:noteId', (req, res) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT c.id FROM collection_notes cn
       JOIN collections c ON c.id = cn.collection_id
       LEFT JOIN collection_collaborators cc ON cc.collection_id = c.id AND cc.user_id = ?
       WHERE cn.note_id = ? AND (c.user_id = ? OR cc.user_id IS NOT NULL)`
    )
    .all(req.user.id, req.params.noteId, req.user.id);
  res.json(rows.map((x) => x.id));
});

/* ----------------------------- collections ----------------------------- */

r.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, CASE WHEN c.user_id = ? THEN 'owner' ELSE cc.role END AS my_role
       FROM collections c
       LEFT JOIN collection_collaborators cc ON cc.collection_id = c.id AND cc.user_id = ?
       WHERE c.user_id = ? OR cc.user_id IS NOT NULL
       ORDER BY c.updated_at DESC`
    )
    .all(req.user.id, req.user.id, req.user.id);
  res.json(rows.map((c) => shape(c, req)));
});

r.post('/', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const info = db
    .prepare('INSERT INTO collections (user_id,name,color,icon) VALUES (?,?,?,?)')
    .run(req.user.id, name.slice(0, 80), req.body?.color || 'violet', req.body?.icon || null);
  const c = db.prepare('SELECT * FROM collections WHERE id=?').get(info.lastInsertRowid);
  res.json(shape({ ...c, my_role: 'owner' }, req));
});

/** A collection plus the notes inside it. */
r.get('/:id', (req, res) => {
  const c = reachable(req, req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const notes = db
    .prepare(
      `SELECT n.* FROM collection_notes cn
       JOIN notes n ON n.id = cn.note_id
       WHERE cn.collection_id = ? AND n.trashed = 0
       ORDER BY n.pinned DESC, n.updated_at DESC`
    )
    .all(c.id);
  res.json({ ...shape(c, req), notes: notes.map(shapeNote) });
});

r.patch('/:id', (req, res) => {
  const c = reachable(req, req.params.id);
  if (!canWrite(c)) return res.status(403).json({ error: 'Read-only access' });
  db.prepare(
    "UPDATE collections SET name=?,color=?,icon=?,updated_at=datetime('now') WHERE id=?"
  ).run(
    req.body?.name !== undefined ? String(req.body.name).slice(0, 80) : c.name,
    req.body?.color ?? c.color,
    req.body?.icon !== undefined ? req.body.icon : c.icon,
    c.id
  );
  const fresh = db.prepare('SELECT * FROM collections WHERE id=?').get(c.id);
  res.json(shape({ ...fresh, my_role: c.my_role }, req));
});

r.delete('/:id', (req, res) => {
  // Deleting a collection never deletes the notes inside it.
  const c = owned(req, req.params.id);
  if (!c) return res.status(403).json({ error: 'Only the owner can delete a collection' });
  db.prepare('DELETE FROM collections WHERE id=?').run(c.id);
  res.json({ ok: true });
});

/* ------------------------------- notes -------------------------------- */

/** Add a note to a collection. The caller must be able to see the note. */
r.post('/:id/notes', (req, res) => {
  const c = reachable(req, req.params.id);
  if (!canWrite(c)) return res.status(403).json({ error: 'Read-only access' });
  const noteId = Number(req.body?.noteId);
  const n = db.prepare('SELECT * FROM notes WHERE id=?').get(noteId);
  if (!n) return res.status(404).json({ error: 'Note not found' });
  if (n.user_id !== req.user.id && !noteVisibleTo(req.user.id, noteId))
    return res.status(403).json({ error: 'You cannot add that note' });
  db.prepare('INSERT OR IGNORE INTO collection_notes (collection_id,note_id) VALUES (?,?)').run(c.id, noteId);
  db.prepare("UPDATE collections SET updated_at=datetime('now') WHERE id=?").run(c.id);
  res.json({ ok: true });
});

r.delete('/:id/notes/:noteId', (req, res) => {
  const c = reachable(req, req.params.id);
  if (!canWrite(c)) return res.status(403).json({ error: 'Read-only access' });
  db.prepare('DELETE FROM collection_notes WHERE collection_id=? AND note_id=?').run(c.id, req.params.noteId);
  res.json({ ok: true });
});

/* ---------------------------- collaborators ---------------------------- */

r.get('/:id/collaborators', (req, res) => {
  const c = reachable(req, req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const owner = db.prepare('SELECT id,username,avatar FROM users WHERE id=?').get(c.user_id);
  const people = db
    .prepare(
      `SELECT u.id,u.username,u.avatar,cc.role FROM collection_collaborators cc
       JOIN users u ON u.id = cc.user_id WHERE cc.collection_id=? ORDER BY u.username`
    )
    .all(c.id);
  res.json({ owner: { ...owner, role: 'owner' }, collaborators: people, isOwner: c.user_id === req.user.id });
});

r.post('/:id/collaborators', (req, res) => {
  const c = owned(req, req.params.id);
  if (!c) return res.status(403).json({ error: 'Only the owner can invite people' });
  const name = String(req.body?.username || '').trim();
  if (!name) return res.status(400).json({ error: 'Username required' });
  const u = db.prepare('SELECT id,username,avatar FROM users WHERE username=? COLLATE NOCASE').get(name);
  if (!u) return res.status(404).json({ error: `No user called "${name}"` });
  if (u.id === c.user_id) return res.status(400).json({ error: 'You already own this collection' });
  const role = req.body?.role === 'viewer' ? 'viewer' : 'editor';
  db.prepare(
    `INSERT INTO collection_collaborators (collection_id,user_id,role) VALUES (?,?,?)
     ON CONFLICT(collection_id,user_id) DO UPDATE SET role=excluded.role`
  ).run(c.id, u.id, role);
  res.json({ ...u, role });
});

r.delete('/:id/collaborators/:userId', (req, res) => {
  const c = owned(req, req.params.id);
  if (!c) return res.status(403).json({ error: 'Only the owner can remove people' });
  db.prepare('DELETE FROM collection_collaborators WHERE collection_id=? AND user_id=?').run(
    c.id,
    req.params.userId
  );
  res.json({ ok: true });
});

/**
 * True when a note reaches a user through any shared collection.
 * Exported so the notes routes can honour collection-based sharing.
 */
export function noteVisibleTo(userId, noteId) {
  return !!db
    .prepare(
      `SELECT 1 FROM collection_notes cn
       JOIN collections c ON c.id = cn.collection_id
       LEFT JOIN collection_collaborators cc ON cc.collection_id = c.id AND cc.user_id = ?
       WHERE cn.note_id = ? AND (c.user_id = ? OR cc.user_id IS NOT NULL)`
    )
    .get(userId, noteId, userId);
}

/** True when the user may edit a note via a collection (owner or editor role). */
export function noteEditableVia(userId, noteId) {
  return !!db
    .prepare(
      `SELECT 1 FROM collection_notes cn
       JOIN collections c ON c.id = cn.collection_id
       LEFT JOIN collection_collaborators cc ON cc.collection_id = c.id AND cc.user_id = ?
       WHERE cn.note_id = ? AND (c.user_id = ? OR cc.role = 'editor')`
    )
    .get(userId, noteId, userId);
}

export default r;
