import { useState } from 'react';
import { useApp } from '../store';
import { Sparkles } from 'lucide-react';

export default function Auth() {
  const { login, register, config } = useApp();
  const firstRun = !config.hasUsers;
  const [mode, setMode] = useState<'login' | 'register'>(firstRun ? 'register' : 'login');
  const [username, setU] = useState('');
  const [email, setE] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const canRegister = config.allowSignup || firstRun;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') await login(username, password);
      else await register(username, email, password);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ padding: '0 0 18px' }}>
          <div className="brand-mark">
            <Sparkles size={19} />
          </div>
          {config.siteName}
        </div>
        <h1>{mode === 'login' ? 'Welcome back' : firstRun ? 'Create admin account' : 'Create account'}</h1>
        <div className="sub">
          {firstRun
            ? 'You are the first user — this account becomes the administrator.'
            : mode === 'login'
              ? 'Sign in to reach your notes and boards.'
              : 'A fresh, private space for your ideas.'}
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <label>Username{mode === 'login' ? ' or email' : ''}</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setU(e.target.value)}
              autoCapitalize="none"
              autoComplete="username"
              required
            />
          </div>
          {mode === 'register' && (
            <div className="field">
              <label>Email (optional)</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setE(e.target.value)}
                autoComplete="email"
              />
            </div>
          )}
          <div className="field">
            <label>Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setP(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>
          {err && <div className="err" style={{ marginBottom: 14 }}>{err}</div>}
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? <div className="spinner" /> : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {!firstRun && (
          <div style={{ marginTop: 18, textAlign: 'center', fontSize: 14, color: 'var(--text-dim)' }}>
            {mode === 'login' ? (
              canRegister ? (
                <>
                  No account?{' '}
                  <button className="btn ghost sm" onClick={() => { setMode('register'); setErr(''); }}>
                    Sign up
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 13 }}>Signups are closed — ask an admin for an account.</span>
              )
            ) : (
              <>
                Already registered?{' '}
                <button className="btn ghost sm" onClick={() => { setMode('login'); setErr(''); }}>
                  Sign in
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
