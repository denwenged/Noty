/**
 * Demo data seeder.
 *
 *   node src/seed.js            # only seeds when the database has no users
 *   node src/seed.js --force    # wipe and recreate the demo content
 *
 * Creates an admin account (demo / demo1234) with a few notes and two boards
 * showing off stickies, shapes, drawings, links and a fixed-size canvas.
 */
import { db } from './db.js';
import { hash } from './auth.js';

const force = process.argv.includes('--force');
const existing = db.prepare('SELECT COUNT(*) c FROM users').get().c;

if (existing && !force) {
  console.log(`[seed] ${existing} user(s) already exist — nothing to do (use --force to reset).`);
  process.exit(0);
}

if (force) {
  db.exec('DELETE FROM board_items; DELETE FROM board_collaborators; DELETE FROM boards; DELETE FROM notes; DELETE FROM shares; DELETE FROM users;');
  console.log('[seed] cleared existing content');
}

const user = db
  .prepare('INSERT INTO users (username,email,password_hash,is_admin) VALUES (?,?,?,1)')
  .run('demo', 'demo@noty.local', hash('demo1234'));
const uid = Number(user.lastInsertRowid);

const note = db.prepare(
  'INSERT INTO notes (user_id,title,content,color,pinned,links) VALUES (?,?,?,?,?,?)'
);
note.run(uid, 'Welcome to Noty', 'Everything here is yours alone. Try the boards!', 'yellow', 1, '[]');
note.run(uid, 'Shopping list', '- Coffee beans\n- Oat milk\n- Cinnamon', 'mint', 0, '[]');
note.run(uid, 'Reading', 'Papers to get through this month.', 'sky', 0, '[]');

const board = db.prepare(
  'INSERT INTO boards (user_id,name,background,canvas_mode,canvas_w,canvas_h) VALUES (?,?,?,?,?,?)'
);
const item = db.prepare(
  'INSERT INTO board_items (board_id,type,x,y,w,h,z,rotation,color,data) VALUES (?,?,?,?,?,?,?,?,?,?)'
);

const b1 = Number(board.run(uid, 'Brainstorm', 'dots', 'infinite', 1920, 1080).lastInsertRowid);
const add = (b, type, x, y, w, h, z, color, data = {}, rot = 0) =>
  item.run(b, type, x, y, w, h, z, rot, color, JSON.stringify(data));

add(b1, 'sticky', 120, 140, 220, 200, 1, 'yellow', { text: 'Ship the PWA' }, -2);
add(b1, 'sticky', 380, 180, 220, 200, 2, 'mint', { text: 'Board shortcuts' }, 1.5);
add(b1, 'sticky', 640, 130, 220, 200, 3, 'rose', { text: 'Invite the team' }, -1);
add(b1, 'text', 120, 40, 360, 70, 4, 'paper', { text: 'Roadmap', size: 34, weight: 750, align: 'left' });
add(b1, 'todo', 120, 380, 260, 220, 5, 'sky', {
  items: [
    { text: 'Sketch the logo', done: true },
    { text: 'Pick an accent colour', done: false },
  ],
});
add(b1, 'shape', 430, 400, 200, 160, 6, 'apricot', { shape: 'ellipse', label: 'Scope' });
add(b1, 'shape', 680, 430, 220, 90, 7, 'violet', { shape: 'arrow' });
add(b1, 'draw', 960, 160, 240, 160, 8, 'paper', {
  strokes: [{ pts: [[980, 300], [1030, 200], [1080, 290], [1130, 190], [1180, 280]], c: '#e5326b', w: 5 }],
  viewBox: [960, 160, 240, 160],
});
add(b1, 'link', 960, 380, 280, 200, 9, 'paper', {
  url: 'https://news.ycombinator.com',
  title: 'Hacker News',
  siteName: 'Hacker News',
  brandColor: '#ff6600',
  isProduct: false,
});

const b2 = Number(board.run(uid, 'Launch poster', 'grid', 'fixed', 1920, 1080).lastInsertRowid);
add(b2, 'text', 160, 120, 900, 120, 1, 'paper', { text: 'Noty 1.0', size: 72, weight: 800, align: 'left' });
add(b2, 'text', 160, 260, 760, 90, 2, 'paper', { text: 'Notes that feel alive.', size: 30, weight: 600, align: 'left', color: '#6d5efc' });
add(b2, 'shape', 160, 400, 420, 260, 3, 'mint', { shape: 'rect' });
add(b2, 'sticky', 700, 420, 220, 200, 4, 'yellow', { text: 'Launch day!' }, 3);

console.log('[seed] created user "demo" (password: demo1234)');
console.log(`[seed] 3 notes, 2 boards, ${db.prepare('SELECT COUNT(*) c FROM board_items').get().c} board items`);
