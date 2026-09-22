import { useEffect, useState } from 'react';
import { UserPlus, Trash2, ShieldCheck, Shield, Ban, CircleCheck } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../store';

type AU = {
  id: number; username: string; email: string | null; isAdmin: boolean;
  disabled: boolean; notes: number; boards: number; createdAt: string;
};

export default function Admin() {
  const { user, toast, refreshConfig } = useApp();
  const [users, setUsers] = useState<AU[]>([]);
  const [settings, setSettings] = useState({ allowSignup: true, siteName: 'Noty' });
  const [nu, setNu] = useState('');
  const [np, setNp] = useState('');
  const [nadmin, setNadmin] = useState(false);

  const load = () => {
    api.get<AU[]>('/admin/users').then(setUsers).catch((e) => toast(e.message, 'err'));
    api.get<typeof settings>('/admin/settings').then(setSettings).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const saveSettings = async (patch: Partial<typeof settings>) => {
    const s = await api.patch<typeof settings>('/admin/settings', patch);
    setSettings(s);
    refreshConfig();
    toast('Saved');
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/users', { username: nu, password: np, isAdmin: nadmin });
      setNu(''); setNp(''); setNadmin(false);
      load();
      toast('User created');
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const patchUser = async (id: number, body: any) => {
    try { await api.patch(`/admin/users/${id}`, body); load(); }
    catch (e: any) { toast(e.message, 'err'); }
  };

  if (!user?.isAdmin) return <div className="empty"><h3>Admins only</h3></div>;

  return (
    <>
      <div className="topbar"><h1>Admin</h1></div>
      <div className="content" style={{ maxWidth: 900 }}>
        <div className="card" style={{ padding: 20, marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>Instance settings</h3>
          <div className="row" style={{ marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>Open sign-ups</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                {settings.allowSignup ? 'Anyone can create an account.' : 'Only you can create accounts below.'}
              </div>
            </div>
            <div className="grow" />
            <button
              className={'switch ' + (settings.allowSignup ? 'on' : '')}
              onClick={() => saveSettings({ allowSignup: !settings.allowSignup })}
              aria-label="Toggle signups"
            />
          </div>
          <div className="row">
            <input className="input" style={{ maxWidth: 260 }} value={settings.siteName} onChange={(e) => setSettings({ ...settings, siteName: e.target.value })} />
            <button className="btn sm" onClick={() => saveSettings({ siteName: settings.siteName })}>Rename instance</button>
          </div>
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>Create user</h3>
          <form onSubmit={addUser} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="input" style={{ flex: '1 1 150px' }} placeholder="Username" value={nu} onChange={(e) => setNu(e.target.value)} required />
            <input className="input" style={{ flex: '1 1 150px' }} type="password" placeholder="Password (6+)" value={np} onChange={(e) => setNp(e.target.value)} required />
            <button type="button" className="row" style={{ gap: 8, fontSize: 14, color: 'var(--text-dim)' }} onClick={() => setNadmin(!nadmin)}>
              <span className={'switch ' + (nadmin ? 'on' : '')} /> Admin
            </button>
            <button className="btn primary"><UserPlus size={16} /> Add</button>
          </form>
        </div>

        <div className="card" style={{ padding: 6, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr><th>User</th><th>Notes</th><th>Boards</th><th>Role</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.username}</b>
                    {u.id === user.id && <span className="chip" style={{ marginLeft: 7 }}>you</span>}
                    {u.email && <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{u.email}</div>}
                  </td>
                  <td>{u.notes}</td>
                  <td>{u.boards}</td>
                  <td>
                    <button className="btn ghost sm" onClick={() => patchUser(u.id, { isAdmin: !u.isAdmin })}>
                      {u.isAdmin ? <ShieldCheck size={15} color="var(--accent)" /> : <Shield size={15} />}
                      {u.isAdmin ? 'Admin' : 'User'}
                    </button>
                  </td>
                  <td>
                    <button className="btn ghost sm" onClick={() => patchUser(u.id, { disabled: !u.disabled })}>
                      {u.disabled ? <Ban size={15} color="#ff6b81" /> : <CircleCheck size={15} />}
                      {u.disabled ? 'Disabled' : 'Active'}
                    </button>
                  </td>
                  <td>
                    {u.id !== user.id && (
                      <button
                        className="btn icon ghost sm danger"
                        onClick={async () => {
                          if (!confirm(`Delete ${u.username} and all their data?`)) return;
                          await api.del(`/admin/users/${u.id}`);
                          load();
                          toast('User deleted');
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
