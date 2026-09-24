import { Router } from 'express';
import { db, getSetting } from '../db.js';
import {
  hash,
  verify,
  issueToken,
  clearToken,
  publicUser,
  requireAuth,
} from '../auth.js';

const r = Router();

r.get('/config', (_req, res) => {
  res.json({
    allowSignup: getSetting('allow_signup') === '1',
    siteName: getSetting('site_name', 'Noty'),
    hasUsers: db.prepare('SELECT COUNT(*) c FROM users').get().c > 0,
  });
});

r.post('/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  if (String(username).length < 2)
    return res.status(400).json({ error: 'Username too short' });
  if (String(password).length < 6)
    return res.status(400).json({ error: 'Password must be 6+ characters' });

  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (count > 0 && getSetting('allow_signup') !== '1')
    return res.status(403).json({ error: 'Signups are currently closed' });

  const exists = db
    .prepare('SELECT 1 FROM users WHERE lower(username) = lower(?)')
    .get(username);
  if (exists) return res.status(409).json({ error: 'Username already taken' });

  const info = db
    .prepare(
      'INSERT INTO users (username,email,password_hash,is_admin) VALUES (?,?,?,?)'
    )
    .run(username, email || null, hash(password), count === 0 ? 1 : 0);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  issueToken(res, user);
  res.json({ user: publicUser(user) });
});

r.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db
    .prepare('SELECT * FROM users WHERE lower(username)=lower(?) OR lower(email)=lower(?)')
    .get(username || '', username || '');
  if (!user || !verify(password || '', user.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' });
  if (user.disabled) return res.status(403).json({ error: 'Account disabled' });
  issueToken(res, user);
  res.json({ user: publicUser(user) });
});

r.post('/logout', (_req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

r.get('/me', (req, res) => res.json({ user: publicUser(req.user) }));

r.patch('/me', requireAuth, (req, res) => {
  const { accent, theme, email, avatar } = req.body || {};
  const u = req.user;
  db.prepare(
    'UPDATE users SET accent=?, theme=?, email=?, avatar=? WHERE id=?'
  ).run(
    accent ?? u.accent,
    theme ?? u.theme,
    email ?? u.email,
    avatar ?? u.avatar,
    u.id
  );
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)) });
});

r.post('/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!verify(current || '', req.user.password_hash))
    return res.status(400).json({ error: 'Current password is wrong' });
  if (String(next || '').length < 6)
    return res.status(400).json({ error: 'Password must be 6+ characters' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash(next), req.user.id);
  res.json({ ok: true });
});

export default r;
