import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { db, UPLOAD_DIR } from '../db.js';
import { requireAuth } from '../auth.js';

const r = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

r.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  if (!/^image\//.test(req.file.mimetype))
    return res.status(400).json({ error: 'Only images are supported' });
  const id = nanoid(16);
  const out = path.join(UPLOAD_DIR, id + '.webp');
  const thumb = path.join(UPLOAD_DIR, id + '.thumb.webp');
  try {
    const img = sharp(req.file.buffer, { animated: false }).rotate();
    await img.clone().resize({ width: 2000, withoutEnlargement: true }).webp({ quality: 86 }).toFile(out);
    await img.clone().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 70 }).toFile(thumb);
  } catch {
    return res.status(400).json({ error: 'Could not process image' });
  }
  const size = fs.statSync(out).size;
  db.prepare('INSERT INTO files (id,user_id,filename,mime,size) VALUES (?,?,?,?,?)').run(
    id,
    req.user.id,
    req.file.originalname || 'image',
    'image/webp',
    size
  );
  res.json({ id, url: `/api/files/${id}`, thumbUrl: `/api/files/${id}?thumb=1`, size });
});

r.get('/:id', (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).end();
  const p = path.join(UPLOAD_DIR, f.id + (req.query.thumb ? '.thumb.webp' : '.webp'));
  if (!fs.existsSync(p)) return res.status(404).end();
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(p).pipe(res);
});

r.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM files WHERE user_id=? ORDER BY created_at DESC LIMIT 200')
    .all(req.user.id);
  res.json(
    rows.map((f) => ({
      id: f.id,
      filename: f.filename,
      size: f.size,
      createdAt: f.created_at,
      url: `/api/files/${f.id}`,
      thumbUrl: `/api/files/${f.id}?thumb=1`,
    }))
  );
});

r.delete('/:id', requireAuth, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  for (const s of ['.webp', '.thumb.webp']) {
    const p = path.join(UPLOAD_DIR, f.id + s);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  db.prepare('DELETE FROM files WHERE id=?').run(f.id);
  res.json({ ok: true });
});

export default r;
