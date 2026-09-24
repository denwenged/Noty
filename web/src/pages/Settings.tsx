import { useEffect, useState } from 'react';
import { Moon, Sun, Check, Download } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../store';
import { ACCENTS, ACCENT_HEX } from '../colors';
import { haptic, hapticsEnabled, setHaptics } from '../lib/haptics';

export default function Settings() {
  const { user, updateUser, toast } = useApp();
  const [haptics, setH] = useState(hapticsEnabled());
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [stats, setStats] = useState<any>(null);

  useEffect(() => { api.get('/stats').then(setStats).catch(() => {}); }, []);

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/auth/password', { current: cur, next });
      setCur(''); setNext('');
      toast('Password updated');
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const exportData = async () => {
    const [notes, boards] = await Promise.all([api.get('/notes'), api.get('/boards')]);
    const blob = new Blob([JSON.stringify({ notes, boards, exportedAt: new Date() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `noty-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <>
      <div className="topbar"><h1>Settings</h1></div>
      <div className="content" style={{ maxWidth: 720 }}>
        {stats && (
          <div className="stat-grid">
            {[['notes', 'Notes'], ['boards', 'Boards'], ['images', 'Images'], ['archived', 'Archived'], ['trashed', 'In trash']].map(([k, label]) => (
              <div className="stat" key={k}><div className="v">{stats[k]}</div><div className="k">{label}</div></div>
            ))}
          </div>
        )}

        <div className="card" style={{ padding: 20, marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>Appearance</h3>
          <div className="row" style={{ marginBottom: 18 }}>
            <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>Theme</span>
            <div className="grow" />
            <button className="btn sm" onClick={() => { haptic.tap(); updateUser({ theme: user?.theme === 'light' ? 'dark' : 'light' }); }}>
              {user?.theme === 'light' ? <Sun size={15} /> : <Moon size={15} />}
              {user?.theme === 'light' ? 'Light' : 'Dark'}
            </button>
          </div>
          <div className="row" style={{ marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 14 }}>Haptics</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>Vibration feedback on supported phones</div>
            </div>
            <div className="grow" />
            <button
              className={'switch ' + (haptics ? 'on' : '')}
              onClick={() => { const v = !haptics; setH(v); setHaptics(v); if (v) haptic.success(); }}
              aria-label="Toggle haptics"
            />
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 10 }}>Accent colour</div>
          <div className="note-colors">
            {ACCENTS.map((a) => (
              <button
                key={a}
                className={'swatch ' + (user?.accent === a ? 'on' : '')}
                style={{ background: ACCENT_HEX[a], width: 34, height: 34 }}
                onClick={() => { haptic.tap(); updateUser({ accent: a }); }}
                title={a}
              >
                {user?.accent === a && <Check size={15} color="#fff" />}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>Account</h3>
          <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 16 }}>
            Signed in as <b style={{ color: 'var(--text)' }}>{user?.username}</b>
            {user?.isAdmin && <span className="chip" style={{ marginLeft: 8 }}>admin</span>}
          </div>
          <form onSubmit={changePw} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: '1 1 160px' }} type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} required />
            <input className="input" style={{ flex: '1 1 160px' }} type="password" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} required />
            <button className="btn primary">Update</button>
          </form>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>Your data</h3>
          <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>Download everything as JSON — notes (with their links) and boards.</p>
          <button className="btn sm" onClick={exportData}><Download size={15} /> Export JSON</button>
        </div>

        <div className="card" style={{ padding: 20, marginTop: 18 }}>
          <h3 style={{ marginTop: 0 }}>Keyboard shortcuts</h3>
          <div style={{ display: 'grid', gap: 8, fontSize: 14, color: 'var(--text-dim)' }}>
            {[['⌘/Ctrl + K', 'Command palette'], ['N', 'New note / sticky'], ['G then N', 'Go to notes'], ['G then B', 'Go to boards'], ['F', 'Fit board to screen'], ['Delete', 'Remove selected board item'], ['Esc', 'Close dialogs']].map(([k, v]) => (
              <div className="row" key={k}><kbd>{k}</kbd><span>{v}</span></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
