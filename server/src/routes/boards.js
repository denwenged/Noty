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

const own = (req, id) =>
  db.prepare('SELECT * FROM boards WHERE id=? AND user_id=?').get(id, req.user.id);

r.get('/', (req, res) => {
  const boards = db
    .prepare('SELECT * FROM boards WHERE user_id=? ORDER BY updated_at DESC')
    .all(req.user.id);
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
  const b = own(req, req.params.id);
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
  const b = own(req, req.params.id);
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
  const b = own(req, req.params.id);
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
  const b = own(req, req.params.id);
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
  const b = own(req, req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM board_items WHERE id=? AND board_id=?').run(req.params.itemId, b.id);
  res.json({ ok: true });
});

export default r;
