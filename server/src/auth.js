import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'noty-dev-secret-change-me';
const COOKIE = 'noty_token';

export function issueToken(res, user) {
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '90d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 90 * 24 * 3600 * 1000,
    secure: false,
  });
  return token;
}

export function clearToken(res) {
  res.clearCookie(COOKIE);
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    isAdmin: !!u.is_admin,
    accent: u.accent,
    theme: u.theme,
    avatar: u.avatar,
    createdAt: u.created_at,
  };
}

function readToken(req) {
  const bearer = req.headers.authorization;
  if (bearer && bearer.startsWith('Bearer ')) return bearer.slice(7);
  return req.cookies?.[COOKIE] || null;
}

export function attachUser(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try {
      const { uid } = jwt.verify(token, JWT_SECRET);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
      if (user && !user.disabled) req.user = user;
    } catch {
      /* invalid token */
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

export const hash = (pw) => bcrypt.hashSync(pw, 10);
export const verify = (pw, h) => bcrypt.compareSync(pw, h);
