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
              if (it.type === 'draw') {
                const vb = it.data.viewBox || [0, 0, it.w, it.h];
                return (
                  <svg key={it.id} style={{ ...base }} viewBox={vb.join(' ')} preserveAspectRatio="none">
                    {(it.data.strokes || []).map((st: any, i: number) => (
                      <polyline key={i} points={st.pts.map((p: number[]) => p.join(',')).join(' ')}
                        fill="none" stroke={st.c} strokeWidth={st.w} strokeLinecap="round" strokeLinejoin="round" />
                    ))}
                  </svg>
                );
              }
              if (it.type === 'shape') {
                const fill = STICKY_COLORS[it.color] || STICKY_COLORS.yellow;
                const k = it.data.shape || 'rect';
                const cm = { fill: it.data.filled === false ? 'none' : fill, stroke: 'rgba(0,0,0,.42)', strokeWidth: 2.5 };
                return (
                  <svg key={it.id} style={{ ...base }} viewBox="0 0 100 100" preserveAspectRatio="none">
                    {k === 'rect' && <rect x="2" y="2" width="96" height="96" rx="7" {...cm} />}
                    {k === 'ellipse' && <ellipse cx="50" cy="50" rx="48" ry="48" {...cm} />}
                    {k === 'triangle' && <polygon points="50,3 97,97 3,97" {...cm} />}
                    {k === 'diamond' && <polygon points="50,2 98,50 50,98 2,50" {...cm} />}
                    {k === 'star' && <polygon points="50,3 61,38 98,38 68,60 79,95 50,73 21,95 32,60 2,38 39,38" {...cm} />}
                    {k === 'arrow' && (<g><line x1="4" y1="50" x2="88" y2="50" stroke={fill} strokeWidth="9" strokeLinecap="round" /><polygon points="76,28 99,50 76,72" fill={fill} /></g>)}
                    {k === 'line' && <line x1="3" y1="50" x2="97" y2="50" stroke={fill} strokeWidth="8" strokeLinecap="round" />}
                  </svg>
                );
              }
              if (it.type === 'link')
                return (
                  <a key={it.id} className="board-item link-card" style={{ ...base, cursor: 'pointer' }} href={it.data.url} target="_blank" rel="noopener">
                    <div className="lc-thumb" style={{
                      height: '52%',
                      backgroundImage: it.data.image ? `url(${it.data.image})` : undefined,
                      backgroundSize: it.data.isProduct ? 'contain' : 'cover',
                      backgroundRepeat: 'no-repeat',
                      backgroundColor: it.data.isProduct ? '#fff' : undefined,
                    }}>
                      {it.data.discountPercent ? <span className="lc-off">-{it.data.discountPercent}%</span> : null}
                    </div>
                    <div className="lc-body">
                      <div className="lc-title">{it.data.title}</div>
                      {it.data.isProduct && it.data.priceFormatted && (
                        <div className="lc-price-row">
                          <span className="lc-price">{it.data.priceFormatted}</span>
                          {it.data.listPriceFormatted && <s className="lc-was">{it.data.listPriceFormatted}</s>}
                        </div>
                      )}
                    </div>
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
