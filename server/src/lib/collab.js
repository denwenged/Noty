/**
 * Live board collaboration over WebSockets.
 *
 * Responsibilities:
 *   - authenticate the socket from the same JWT cookie the REST API uses
 *   - check the user may open the board (owner or invited collaborator)
 *   - broadcast cursor movement (ephemeral, never stored)
 *   - relay item create/update/delete so other editors update instantly
 *
 * Item persistence still happens through the REST API; this channel only
 * mirrors the change to everyone else viewing the same board.
 */

import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { JWT_SECRET } from '../auth.js';

/** boardId -> Set<client> */
const rooms = new Map();

/** Distinct, high-contrast cursor colours assigned per session. */
const CURSOR_COLORS = [
  '#e5326b', '#1e8fd5', '#0aa87e', '#f2681f',
  '#6d5efc', '#d81bd8', '#0bb3c4', '#f5b800',
];

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function userFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.noty_token || cookies.token;
  if (!token) return null;
  try {
    const { uid } = jwt.verify(token, JWT_SECRET);
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(uid);
    return u && !u.disabled ? u : null;
  } catch {
    return null;
  }
}

function canOpenBoard(userId, boardId) {
  return !!db
    .prepare(
      `SELECT 1 FROM boards b
       LEFT JOIN board_collaborators c ON c.board_id = b.id AND c.user_id = ?
       WHERE b.id = ? AND (b.user_id = ? OR c.user_id IS NOT NULL)`
    )
    .get(userId, boardId, userId);
}

const room = (id) => {
  if (!rooms.has(id)) rooms.set(id, new Set());
  return rooms.get(id);
};

function send(ws, msg) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(msg)); } catch { /* socket closing */ }
  }
}

/** Send to everyone in the board except the originator. */
function broadcast(boardId, msg, except) {
  for (const c of room(boardId)) if (c !== except) send(c, msg);
}

/** The people list, as the client wants to render it. */
const peersOf = (boardId) =>
  [...room(boardId)].map((c) => ({
    sid: c.sid,
    id: c.user.id,
    username: c.user.username,
    color: c.color,
    x: c.cursor?.x ?? null,
    y: c.cursor?.y ?? null,
  }));

export function attachCollab(server) {
  const wss = new WebSocketServer({ noServer: true });
  let seq = 0;

  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return socket.destroy(); }
    if (url.pathname !== '/api/collab') return socket.destroy();

    const user = userFromRequest(req);
    const boardId = Number(url.searchParams.get('board'));
    if (!user || !boardId || !canOpenBoard(user.id, boardId)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = user;
      ws.boardId = boardId;
      ws.sid = `${user.id}-${++seq}`;
      ws.color = CURSOR_COLORS[seq % CURSOR_COLORS.length];
      ws.cursor = null;
      ws.isAlive = true;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    const { boardId } = ws;
    room(boardId).add(ws);

    // Tell the newcomer who is already here, then announce them to the rest.
    send(ws, {
      t: 'hello',
      sid: ws.sid,
      color: ws.color,
      you: { id: ws.user.id, username: ws.user.username },
      peers: peersOf(boardId).filter((p) => p.sid !== ws.sid),
    });
    broadcast(boardId, { t: 'join', peer: peersOf(boardId).find((p) => p.sid === ws.sid) }, ws);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString().slice(0, 200000)); } catch { return; }

      switch (m.t) {
        case 'cursor':
          // Ephemeral presence — kept in memory only.
          ws.cursor = { x: m.x, y: m.y };
          broadcast(boardId, { t: 'cursor', sid: ws.sid, x: m.x, y: m.y }, ws);
          break;
        case 'blur':
          ws.cursor = null;
          broadcast(boardId, { t: 'blur', sid: ws.sid }, ws);
          break;
        // Item mirroring: the sender has already persisted via REST.
        case 'item:add':
        case 'item:update':
        case 'item:remove':
        case 'board:update':
          broadcast(boardId, { ...m, sid: ws.sid }, ws);
          break;
        default:
          break;
      }
    });

    const bye = () => {
      room(boardId).delete(ws);
      broadcast(boardId, { t: 'leave', sid: ws.sid });
      if (!room(boardId).size) rooms.delete(boardId);
    };
    ws.on('close', bye);
    ws.on('error', bye);
  });

  // Drop sockets that stopped responding (laptop lid, dead tab).
  const ping = setInterval(() => {
    for (const set of rooms.values()) {
      for (const ws of set) {
        if (!ws.isAlive) { ws.terminate(); continue; }
        ws.isAlive = false;
        try { ws.ping(); } catch { /* ignore */ }
      }
    }
  }, 30000);
  ping.unref?.();

  return wss;
}
