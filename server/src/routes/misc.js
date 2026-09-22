import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db, getSetting, setSetting } from '../db.js';
import { requireAuth, requireAdmin, hash, publicUser } from '../auth.js';
import { shapeItem } from './boards.js';
import { unfurl } from '../lib/unfurl.js';

const r = Router();

/* -------- link preview: OG metadata + product price/image -------- */
r.post('/unfurl', requireAuth, async (req, res) => {
  let { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL required' });
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (!/^https?:$/.test(parsed.protocol))
    return res.status(400).json({ error: 'Unsupported protocol' });

  try {
    res.json(await unfurl(url));
  } catch {
    res.json({
      url,
      title: parsed.hostname.replace(/^www\./, ''),
      description: '',
      favicon: `https://icons.duckduckgo.com/ip3/${parsed.hostname}.ico`,
      image: null,
      isProduct: false,
    });
  }
});

/* --------------------- share links ------------------------ */
r.post('/shares', requireAuth, (req, res) => {
  const { type, id } = req.body || {};
  if (!['note', 'board'].includes(type)) return res.status(400).json({ error: 'Bad type' });
  const table = type === 'note' ? 'notes' : 'boards';
  const owns = db.prepare(`SELECT 1 FROM ${table} WHERE id=? AND user_id=?`).get(id, req.user.id);
  if (!owns) return res.status(404).json({ error: 'Not found' });
  const existing = db
    .prepare('SELECT * FROM shares WHERE user_id=? AND target_type=? AND target_id=?')
    .get(req.user.id, type, id);
  if (existing) return res.json({ slug: existing.slug, path: `/s/${existing.slug}` });
  const slug = nanoid(8);
  db.prepare('INSERT INTO shares (slug,user_id,target_type,target_id) VALUES (?,?,?,?)').run(
    slug,
    req.user.id,
    type,
    id
  );
  res.json({ slug, path: `/s/${slug}` });
});

r.delete('/shares/:slug', requireAuth, (req, res) => {
  db.prepare('DELETE FROM shares WHERE slug=? AND user_id=?').run(req.params.slug, req.user.id);
  res.json({ ok: true });
});

r.get('/shares', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM shares WHERE user_id=?').all(req.user.id));
});

// Public, read-only
r.get('/s/:slug', (req, res) => {
  const s = db.prepare('SELECT * FROM shares WHERE slug=?').get(req.params.slug);
  if (!s) return res.status(404).json({ error: 'Link not found' });
  const owner = db.prepare('SELECT username FROM users WHERE id=?').get(s.user_id);
  if (s.target_type === 'note') {
    const n = db.prepare('SELECT * FROM notes WHERE id=?').get(s.target_id);
    if (!n) return res.status(404).json({ error: 'Gone' });
    return res.json({
      type: 'note',
      owner: owner?.username,
      note: {
        title: n.title,
        content: n.content,
        color: n.color,
        tags: JSON.parse(n.tags || '[]'),
        links: JSON.parse(n.links || '[]'),
        updatedAt: n.updated_at,
      },
    });
  }
  const b = db.prepare('SELECT * FROM boards WHERE id=?').get(s.target_id);
  if (!b) return res.status(404).json({ error: 'Gone' });
  const items = db.prepare('SELECT * FROM board_items WHERE board_id=?').all(b.id);
  res.json({
    type: 'board',
    owner: owner?.username,
    board: {
      name: b.name,
      background: b.background,
      canvasMode: b.canvas_mode,
      canvasW: b.canvas_w,
      canvasH: b.canvas_h,
      items: items.map(shapeItem),
    },
  });
});

/* ------------------------- search -------------------------- */
r.get('/search', requireAuth, (req, res) => {
  const q = `%${(req.query.q || '').toString().toLowerCase()}%`;
  const notes = db
    .prepare(
      `SELECT * FROM notes WHERE user_id=? AND trashed=0 AND (lower(title) LIKE ? OR lower(content) LIKE ? OR lower(tags) LIKE ?) LIMIT 50`
    )
    .all(req.user.id, q, q, q);
  const boards = db
    .prepare('SELECT * FROM boards WHERE user_id=? AND lower(name) LIKE ? LIMIT 20')
    .all(req.user.id, q);
  // links live inside notes now — surface each matching link as its own result
  const linkRows = db
    .prepare("SELECT id,title,links FROM notes WHERE user_id=? AND trashed=0 AND links != '[]'")
    .all(req.user.id);
  const needle = (req.query.q || '').toString().toLowerCase();
  const links = [];
  for (const row of linkRows) {
    for (const l of JSON.parse(row.links || '[]')) {
      if (
        !needle ||
        (l.title || '').toLowerCase().includes(needle) ||
        (l.url || '').toLowerCase().includes(needle)
      )
        links.push({ ...l, noteId: row.id, noteTitle: row.title });
      if (links.length >= 20) break;
    }
  }
  const collections = db
    .prepare(
      `SELECT DISTINCT c.* FROM collections c
       LEFT JOIN collection_collaborators cc ON cc.collection_id = c.id AND cc.user_id = ?
       WHERE (c.user_id = ? OR cc.user_id IS NOT NULL) AND lower(c.name) LIKE ? LIMIT 20`
    )
    .all(req.user.id, req.user.id, q);
  res.json({
    notes: notes.map((n) => ({ id: n.id, title: n.title, content: n.content, color: n.color })),
    boards: boards.map((b) => ({ id: b.id, name: b.name })),
    collections: collections.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    links,
  });
});

/* ------------------------- stats --------------------------- */
r.get('/stats', requireAuth, (req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(req.user.id, ...a).c;
  res.json({
    notes: one('SELECT COUNT(*) c FROM notes WHERE user_id=? AND trashed=0 AND archived=0'),
    archived: one('SELECT COUNT(*) c FROM notes WHERE user_id=? AND archived=1'),
    trashed: one('SELECT COUNT(*) c FROM notes WHERE user_id=? AND trashed=1'),
    boards: one('SELECT COUNT(*) c FROM boards WHERE user_id=?'),
    collections: one(
      `SELECT COUNT(DISTINCT c.id) c FROM collections c
       LEFT JOIN collection_collaborators cc ON cc.collection_id = c.id AND cc.user_id = ?
       WHERE c.user_id = ? OR cc.user_id IS NOT NULL`,
      req.user.id
    ),
    images: one('SELECT COUNT(*) c FROM files WHERE user_id=?'),
  });
});

/* ------------------------- admin --------------------------- */
r.get('/admin/settings', requireAuth, requireAdmin, (_req, res) => {
  res.json({
    allowSignup: getSetting('allow_signup') === '1',
    siteName: getSetting('site_name', 'Noty'),
  });
});

r.patch('/admin/settings', requireAuth, requireAdmin, (req, res) => {
  if (req.body?.allowSignup !== undefined)
    setSetting('allow_signup', req.body.allowSignup ? '1' : '0');
  if (req.body?.siteName) setSetting('site_name', req.body.siteName);
  res.json({
    allowSignup: getSetting('allow_signup') === '1',
    siteName: getSetting('site_name'),
  });
});

r.get('/admin/users', requireAuth, requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY id').all();
  res.json(
    rows.map((u) => ({
      ...publicUser(u),
      disabled: !!u.disabled,
      notes: db.prepare('SELECT COUNT(*) c FROM notes WHERE user_id=?').get(u.id).c,
      boards: db.prepare('SELECT COUNT(*) c FROM boards WHERE user_id=?').get(u.id).c,
    }))
  );
});

r.post('/admin/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, isAdmin } = req.body || {};
  if (!username || String(password || '').length < 6)
    return res.status(400).json({ error: 'Username and 6+ char password required' });
  if (db.prepare('SELECT 1 FROM users WHERE lower(username)=lower(?)').get(username))
    return res.status(409).json({ error: 'Username taken' });
  db.prepare('INSERT INTO users (username,password_hash,is_admin) VALUES (?,?,?)').run(
    username,
    hash(password),
    isAdmin ? 1 : 0
  );
  res.json({ ok: true });
});

r.patch('/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  if (u.id === req.user.id && (b.disabled || b.isAdmin === false))
    return res.status(400).json({ error: "You can't lock yourself out" });
  db.prepare('UPDATE users SET is_admin=?, disabled=? WHERE id=?').run(
    b.isAdmin !== undefined ? (b.isAdmin ? 1 : 0) : u.is_admin,
    b.disabled !== undefined ? (b.disabled ? 1 : 0) : u.disabled,
    u.id
  );
  if (b.password && String(b.password).length >= 6)
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash(b.password), u.id);
  res.json({ ok: true });
});

r.delete('/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id)
    return res.status(400).json({ error: "You can't delete yourself" });
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

export default r;
