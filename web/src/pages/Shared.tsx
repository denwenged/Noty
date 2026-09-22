import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { api } from '../api';
import { STICKY_COLORS } from '../colors';

export default function Shared() {
  const { slug } = useParams();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get(`/s/${slug}`).then(setData).catch((e) => setErr(e.message));
  }, [slug]);

  if (err)
    return (
      <div className="auth-wrap">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 46 }}>🔍</div>
          <h1>Link not found</h1>
          <div className="sub">This share link has expired or been revoked.</div>
          <Link className="btn primary" to="/">Go to Noty</Link>
        </div>
      </div>
    );

  if (!data) return <div className="empty" style={{ paddingTop: 140 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;

  return (
    <div style={{ minHeight: '100dvh', position: 'relative', zIndex: 1 }}>
      <div className="topbar">
        <Link className="brand" to="/" style={{ padding: 0, fontSize: 18 }}>
          <div className="brand-mark" style={{ width: 30, height: 30 }}><Sparkles size={15} /></div>
          Noty
        </Link>
        <div className="grow" />
        <span className="chip">shared by {data.owner}</span>
      </div>

      {data.type === 'note' ? (
        <div className="content" style={{ maxWidth: 720, margin: '0 auto' }}>
          <h1 style={{ letterSpacing: '-0.8px' }}>{data.note.title || 'Untitled note'}</h1>
          <div style={{ display: 'flex', gap: 7, marginBottom: 18, flexWrap: 'wrap' }}>
            {data.note.tags.map((t: string) => <span className="chip" key={t}>#{t}</span>)}
          </div>
          {(data.note.links || []).length > 0 && (
            <div className="note-links" style={{ marginBottom: 20 }}>
              {data.note.links.map((l: any, i: number) => (
                <a key={i} className="link-pill" href={l.url} target="_blank" rel="noopener">
                  <img src={l.favicon} alt="" onError={(e) => ((e.target as HTMLElement).style.visibility = 'hidden')} />
                  <div className="lp-text">
                    <div className="lp-title">{l.title || l.url}</div>
                    <div className="lp-host">{l.url}</div>
                  </div>
                </a>
              ))}
            </div>
          )}
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 16 }}>
            {data.note.content.split(/(!\[[^\]]*\]\([^)]+\))/g).map((part: string, i: number) => {
              const m = part.match(/!\[[^\]]*\]\(([^)]+)\)/);
              return m
                ? <img key={i} src={m[1]} style={{ maxWidth: '100%', borderRadius: 14, margin: '12px 0', display: 'block' }} />
                : <span key={i}>{part}</span>;
            })}
          </div>
        </div>
      ) : (
        <div
          className={data.board.canvasMode === 'fixed' ? '' : 'bg-' + data.board.background}
          style={{ position: 'relative', height: 'calc(100dvh - 68px)', overflow: 'auto', backgroundSize: '26px 26px' }}
        >
          <div
            className={data.board.canvasMode === 'fixed' ? 'canvas-page bg-' + data.board.background : ''}
            style={
              data.board.canvasMode === 'fixed'
                ? { position: 'relative', width: data.board.canvasW, height: data.board.canvasH, margin: 24, backgroundSize: '26px 26px' }
                : { position: 'relative', width: 4000, height: 3000 }
            }
          >
            {data.board.items.map((it: any) => {
              const base: React.CSSProperties = {
                position: 'absolute', left: it.x, top: it.y, width: it.w, height: it.h,
                zIndex: it.z, transform: it.rotation ? `rotate(${it.rotation}deg)` : undefined,
              };
              if (it.type === 'image')
                return <img key={it.id} src={it.data.url} style={{ ...base, objectFit: 'cover', borderRadius: 14 }} />;
              if (it.type === 'link')
                return (
                  <a key={it.id} className="board-item link-card" style={{ ...base, cursor: 'pointer' }} href={it.data.url} target="_blank" rel="noopener">
                    <div className="lc-thumb" style={it.data.image ? { backgroundImage: `url(${it.data.image})` } : undefined} />
                    <div className="lc-body"><div className="lc-title">{it.data.title}</div></div>
                  </a>
                );
              if (it.type === 'text')
                return <div key={it.id} style={{ ...base, fontSize: 27, fontWeight: 750 }}>{it.data.text}</div>;
              if (it.type === 'todo')
                return (
                  <div key={it.id} className="board-item" style={{ ...base, background: STICKY_COLORS[it.color] || '#f5f3ea', color: '#23231f', padding: 12 }}>
                    <b>{it.data.title}</b>
                    {(it.data.items || []).map((r: any, i: number) => (
                      <div key={i} style={{ fontSize: 13.5, textDecoration: r.d ? 'line-through' : 'none', opacity: r.d ? .55 : 1 }}>
                        {r.d ? '☑' : '☐'} {r.t}
                      </div>
                    ))}
                  </div>
                );
              return (
                <div key={it.id} className="sticky" style={{ ...base, background: STICKY_COLORS[it.color] || STICKY_COLORS.yellow, cursor: 'default' }}>
                  {it.data.text}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
