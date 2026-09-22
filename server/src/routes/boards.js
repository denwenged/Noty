import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

const r = Router();
r.use(requireAuth);

export const shapeItem = (i) => ({
  id: i.id,
  boardId: i.board_id,
  type: i.type,
  x: i.x,
  y: i.y,
  w: i.w,
  h: i.h,
  z: i.z,
  rotation: i.rotation,
  color: i.color,
  data: JSON.parse(i.data || '{}'),
});

/** Board the user owns. */
const own = (req, id) =>
  db.prepare('SELECT * FROM boards WHERE id=? AND user_id=?').get(id, req.user.id);

/** Board the user owns OR has been invited to edit. */
export const accessible = (req, id) =>
  db
    .prepare(
      `SELECT b.* FROM boards b
       LEFT JOIN board_collaborators c ON c.board_id = b.id AND c.user_id = ?
       WHERE b.id = ? AND (b.user_id = ? OR c.user_id IS NOT NULL)`
    )
    .get(req.user.id, id, req.user.id);

r.get('/', (req, res) => {
  const boards = db
    .prepare(
      `SELECT DISTINCT b.*, (b.user_id != ?) AS shared FROM boards b
       LEFT JOIN board_collaborators c ON c.board_id = b.id AND c.user_id = ?
       WHERE b.user_id = ? OR c.user_id IS NOT NULL
       ORDER BY b.updated_at DESC`
    )
    .all(req.user.id, req.user.id, req.user.id);
  res.json(
    boards.map((b) => ({
      id: b.id,
      name: b.name,
      background: b.background,
      canvasMode: b.canvas_mode,
      canvasW: b.canvas_w,
      canvasH: b.canvas_h,
      createdAt: b.created_at,
      updatedAt: b.updated_at,
      shared: !!b.shared,
      itemCount: db.prepare('SELECT COUNT(*) c FROM board_items WHERE board_id=?').get(b.id).c,
    }))
  );
});

r.post('/', (req, res) => {
  const info = db
    .prepare(
      'INSERT INTO boards (user_id,name,background,canvas_mode,canvas_w,canvas_h) VALUES (?,?,?,?,?,?)'
    )
    .run(
      req.user.id,
      req.body?.name || 'Untitled board',
      req.body?.background || 'dots',
      req.body?.canvasMode === 'fixed' ? 'fixed' : 'infinite',
      Math.max(320, Math.min(10000, Number(req.body?.canvasW) || 1920)),
      Math.max(320, Math.min(10000, Number(req.body?.canvasH) || 1080))
    );
  const b = db.prepare('SELECT * FROM boards WHERE id=?').get(info.lastInsertRowid);
  res.json({
    id: b.id, name: b.name, background: b.background,
    canvasMode: b.canvas_mode, canvasW: b.canvas_w, canvasH: b.canvas_h, itemCount: 0,
  });
});

r.get('/:id', (req, res) => {
  const b = accessible(req, req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare('SELECT * FROM board_items WHERE board_id=?').all(b.id);
  res.json({
    id: b.id,
    name: b.name,
    background: b.background,
    canvasMode: b.canvas_mode,
    canvasW: b.canvas_w,
    canvasH: b.canvas_h,
    items: items.map(shapeItem),
  });
});

r.patch('/:id', (req, res) => {
  const b = accessible(req, req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    "UPDATE boards SET name=?,background=?,canvas_mode=?,canvas_w=?,canvas_h=?,updated_at=datetime('now') WHERE id=?"
  ).run(
    req.body?.name ?? b.name,
    req.body?.background ?? b.background,
    req.body?.canvasMode ?? b.canvas_mode,
    req.body?.canvasW ? Math.max(320, Math.min(10000, Number(req.body.canvasW))) : b.canvas_w,
    req.body?.canvasH ? Math.max(320, Math.min(10000, Number(req.body.canvasH))) : b.canvas_h,
    b.id
  );
  res.json({ ok: true });
});

r.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM boards WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

r.post('/:id/items', (req, res) => {
  const b = accessible(req, req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  const i = req.body || {};
  const info = db
    .prepare(
      `INSERT INTO board_items (board_id,type,x,y,w,h,z,rotation,color,data)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      b.id,
      i.type || 'sticky',
      i.x ?? 40,
      i.y ?? 40,
      i.w ?? 220,
      i.h ?? 200,
      i.z ?? 1,
      i.rotation ?? 0,
      i.color || 'yellow',
      JSON.stringify(i.data || {})
    );
  db.prepare("UPDATE boards SET updated_at=datetime('now') WHERE id=?").run(b.id);
  res.json(shapeItem(db.prepare('SELECT * FROM board_items WHERE id=?').get(info.lastInsertRowid)));
});

r.patch('/:id/items/:itemId', (req, res) => {
  const b = accessible(req, req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  const it = db
    .prepare('SELECT * FROM board_items WHERE id=? AND board_id=?')
    .get(req.params.itemId, b.id);
  if (!it) return res.status(404).json({ error: 'Not found' });
  const i = req.body || {};
  db.prepare(
    `UPDATE board_items SET x=?,y=?,w=?,h=?,z=?,rotation=?,color=?,data=?,updated_at=datetime('now') WHERE id=?`
  ).run(
    i.x ?? it.x,
    i.y ?? it.y,
    i.w ?? it.w,
    i.h ?? it.h,
    i.z ?? it.z,
    i.rotation ?? it.rotation,
    i.color ?? it.color,
    i.data ? JSON.stringify(i.data) : it.data,
    it.id
  );
  db.prepare("UPDATE boards SET updated_at=datetime('now') WHERE id=?").run(b.id);
  res.json(shapeItem(db.prepare('SELECT * FROM board_items WHERE id=?').get(it.id)));
});

r.delete('/:id/items/:itemId', (req, res) => {
  const b = accessible(req, req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM board_items WHERE id=? AND board_id=?').run(req.params.itemId, b.id);
  res.json({ ok: true });
});

/* ------------------- collaborators (live editing) ------------------- */

const ownerOnly = (req, res) => {
  const b = own(req, req.params.id);
  if (!b) { res.status(403).json({ error: 'Only the board owner can manage collaborators' }); return null; }
  return b;
};

r.get('/:id/collaborators', (req, res) => {
  const b = accessible(req, req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  const owner = db.prepare('SELECT id,username,avatar FROM users WHERE id=?').get(b.user_id);
  const people = db
    .prepare(
      `SELECT u.id, u.username, u.avatar, c.role FROM board_collaborators c
       JOIN users u ON u.id = c.user_id WHERE c.board_id = ? ORDER BY u.username`
    )
    .all(b.id);
  res.json({ owner: { ...owner, role: 'owner' }, collaborators: people, isOwner: b.user_id === req.user.id });
});

r.post('/:id/collaborators', (req, res) => {
  const b = ownerOnly(req, res);
  if (!b) return;
  const name = String(req.body?.username || '').trim();
  if (!name) return res.status(400).json({ error: 'Username required' });
  const u = db.prepare('SELECT id,username,avatar FROM users WHERE username=? COLLATE NOCASE').get(name);
  if (!u) return res.status(404).json({ error: `No user called "${name}"` });
  if (u.id === b.user_id) return res.status(400).json({ error: 'You already own this board' });
  db.prepare(
    'INSERT OR IGNORE INTO board_collaborators (board_id,user_id,role) VALUES (?,?,?)'
  ).run(b.id, u.id, req.body?.role === 'viewer' ? 'viewer' : 'editor');
  res.json({ ...u, role: req.body?.role === 'viewer' ? 'viewer' : 'editor' });
});

r.delete('/:id/collaborators/:userId', (req, res) => {
  const b = ownerOnly(req, res);
  if (!b) return;
  db.prepare('DELETE FROM board_collaborators WHERE board_id=? AND user_id=?').run(b.id, req.params.userId);
  res.json({ ok: true });
});

export default r;
