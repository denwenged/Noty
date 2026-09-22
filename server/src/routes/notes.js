import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

const r = Router();
r.use(requireAuth);

const shape = (n) => ({
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
});

r.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM notes WHERE user_id=? ORDER BY pinned DESC, updated_at DESC')
    .all(req.user.id);
  res.json(rows.map(shape));
});

r.post('/', (req, res) => {
  const b = req.body || {};
  const info = db
    .prepare(
      `INSERT INTO notes (user_id,title,content,color,icon,pinned,tags,links,reminder_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      req.user.id,
      b.title || '',
      b.content || '',
      b.color || 'default',
      b.icon || null,
      b.pinned ? 1 : 0,
      JSON.stringify(b.tags || []),
      JSON.stringify(b.links || []),
      b.reminderAt || null
    );
  res.json(shape(db.prepare('SELECT * FROM notes WHERE id=?').get(info.lastInsertRowid)));
});

r.patch('/:id', (req, res) => {
  const n = db
    .prepare('SELECT * FROM notes WHERE id=? AND user_id=?')
    .get(req.params.id, req.user.id);
  if (!n) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  db.prepare(
    `UPDATE notes SET title=?,content=?,color=?,icon=?,pinned=?,archived=?,trashed=?,tags=?,links=?,reminder_at=?,updated_at=datetime('now')
     WHERE id=?`
  ).run(
    b.title ?? n.title,
    b.content ?? n.content,
    b.color ?? n.color,
    b.icon !== undefined ? b.icon : n.icon,
    b.pinned !== undefined ? (b.pinned ? 1 : 0) : n.pinned,
    b.archived !== undefined ? (b.archived ? 1 : 0) : n.archived,
    b.trashed !== undefined ? (b.trashed ? 1 : 0) : n.trashed,
    b.tags ? JSON.stringify(b.tags) : n.tags,
    b.links ? JSON.stringify(b.links) : n.links,
    b.reminderAt !== undefined ? b.reminderAt : n.reminder_at,
    n.id
  );
  res.json(shape(db.prepare('SELECT * FROM notes WHERE id=?').get(n.id)));
});

r.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

r.post('/empty-trash', (req, res) => {
  db.prepare('DELETE FROM notes WHERE user_id=? AND trashed=1').run(req.user.id);
  res.json({ ok: true });
});

export default r;
