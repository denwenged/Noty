/**
 * Live board collaboration client.
 *
 * Opens a WebSocket to /api/collab, keeps a list of other editors and their
 * cursors, and relays local item changes. The socket is best-effort: if it
 * cannot connect the board still works exactly as before, just without
 * presence, so single-user use is never blocked by a proxy that drops WS.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type Peer = {
  sid: string;
  id: number;
  username: string;
  color: string;
  x: number | null;
  y: number | null;
};

type Incoming =
  | { t: 'hello'; sid: string; color: string; you: { id: number; username: string }; peers: Peer[] }
  | { t: 'join'; peer: Peer }
  | { t: 'leave'; sid: string }
  | { t: 'cursor'; sid: string; x: number; y: number }
  | { t: 'blur'; sid: string }
  | { t: 'item:add' | 'item:update' | 'item:remove' | 'board:update'; [k: string]: any };

export function useCollab(
  boardId: number | undefined,
  onRemote: (msg: Extract<Incoming, { t: `item:${string}` | 'board:update' }>) => void
) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const remoteRef = useRef(onRemote);
  remoteRef.current = onRemote;

  useEffect(() => {
    if (!boardId) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const connect = () => {
      if (closed) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      let sock: WebSocket;
      try {
        sock = new WebSocket(`${proto}//${location.host}/api/collab?board=${boardId}`);
      } catch {
        return;
      }
      ws.current = sock;

      sock.onopen = () => { attempts = 0; setConnected(true); };

      sock.onmessage = (ev) => {
        let m: Incoming;
        try { m = JSON.parse(ev.data); } catch { return; }
        switch (m.t) {
          case 'hello': setPeers(m.peers); break;
          case 'join': setPeers((p) => [...p.filter((x) => x.sid !== m.peer.sid), m.peer]); break;
          case 'leave': setPeers((p) => p.filter((x) => x.sid !== m.sid)); break;
          case 'cursor':
            setPeers((p) => p.map((x) => (x.sid === m.sid ? { ...x, x: m.x, y: m.y } : x)));
            break;
          case 'blur':
            setPeers((p) => p.map((x) => (x.sid === m.sid ? { ...x, x: null, y: null } : x)));
            break;
          default: remoteRef.current(m as any);
        }
      };

      const down = () => {
        setConnected(false);
        setPeers([]);
        if (closed) return;
        // Back off, but keep trying — laptops sleep, proxies recycle.
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 15000));
      };
      sock.onclose = down;
      sock.onerror = () => sock.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws.current?.close();
      ws.current = null;
    };
  }, [boardId]);

  const send = useCallback((msg: Record<string, unknown>) => {
    const s = ws.current;
    if (s && s.readyState === WebSocket.OPEN) {
      try { s.send(JSON.stringify(msg)); } catch { /* dropped frame is fine */ }
    }
  }, []);

  return { peers, connected, send };
}
