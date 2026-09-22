import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { attachUser } from './auth.js';
import './db.js';
import authRoutes from './routes/auth.js';
import noteRoutes from './routes/notes.js';
import boardRoutes from './routes/boards.js';
import fileRoutes from './routes/files.js';
import miscRoutes from './routes/misc.js';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/files', fileRoutes);
app.use('/api', miscRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint' }));

// Serve built SPA in production
const dist = path.resolve(process.cwd(), 'public');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => console.log(`Noty API listening on :${PORT}`));
