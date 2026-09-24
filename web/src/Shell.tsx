import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles, StickyNote, Pin, LayoutDashboard, Settings as Cog,
  Archive, Trash2, Shield, LogOut, Menu, Search, Plus,
  FolderOpen,
} from 'lucide-react';
import { useApp } from './store';
import { api } from './api';
import CommandPalette from './CommandPalette';
import { haptic } from './lib/haptics';
import { useIsPhone } from './lib/gestures';

export default function Shell() {
  const { user, logout, config } = useApp();
  const [open, setOpen] = useState(false);
  const [cmd, setCmd] = useState(false);
  const [stats, setStats] = useState<any>({});
  const nav = useNavigate();
  const loc = useLocation();
  const phone = useIsPhone();

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => { api.get('/stats').then(setStats).catch(() => {}); }, [loc.pathname]);

  useEffect(() => {
    let g = false;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA'].includes(t.tagName) || t.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd(true); return; }
      if (typing) return;
      if (e.key.toLowerCase() === 'g') { g = true; setTimeout(() => (g = false), 900); return; }
      if (g) {
        const map: Record<string, string> = { n: '/notes', b: '/boards', c: '/collections', p: '/settings' };
        if (map[e.key.toLowerCase()]) { nav(map[e.key.toLowerCase()]); g = false; }
        return;
      }
      if (e.key.toLowerCase() === 'n' && !loc.pathname.startsWith('/boards/')) { e.preventDefault(); nav('/notes?new=1'); }
      if (e.key === '/') { e.preventDefault(); setCmd(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav, loc.pathname]);

  const Item = ({ to, icon: Icon, label, count }: any) => (
    <NavLink
      to={to}
      className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
      end={to === '/notes'}
      onClick={() => haptic.tap()}
    >
      <Icon size={18} /> {label}
      {count > 0 && <Count value={count} />}
    </NavLink>
  );

  return (
    <div className="app">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="brand">
          <div className="brand-mark"><Sparkles size={19} /></div>
          {config.siteName}
        </div>

        <button className="btn primary" style={{ justifyContent: 'center', marginBottom: 8 }} onClick={() => nav('/notes?new=1')}>
          <Plus size={17} /> New note
        </button>
        <button className="btn ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setCmd(true)}>
          <Search size={17} /> Search <kbd style={{ marginLeft: 'auto' }}>⌘K</kbd>
        </button>

        <div className="nav-label">Notes</div>
        <Item to="/notes" icon={StickyNote} label="All notes" count={stats.notes} />
        <Item to="/pinned" icon={Pin} label="Pinned" />
        <Item to="/archive" icon={Archive} label="Archive" count={stats.archived} />
        <Item to="/trash" icon={Trash2} label="Trash" count={stats.trashed} />

        <div className="nav-label">Workspace</div>
        <Item to="/collections" icon={FolderOpen} label="Collections" count={stats.collections} />
        <Item to="/boards" icon={LayoutDashboard} label="Whiteboards" count={stats.boards} />

        <div className="nav-label">Account</div>
        <Item to="/settings" icon={Cog} label="Settings" />
        {user?.isAdmin && <Item to="/admin" icon={Shield} label="Admin" />}

        <div style={{ marginTop: 'auto', paddingTop: 14 }}>
          <div className="nav-item" style={{ cursor: 'default' }}>
            <div
              style={{
                width: 30, height: 30, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg,var(--accent),var(--accent-2))',
                display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 13,
              }}
            >
              {user?.username[0]?.toUpperCase()}
            </div>
            <span style={{ color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.username}
            </span>
            <button className="btn icon ghost sm" style={{ marginLeft: 'auto' }} onClick={logout} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        {!phone && (
          <button
            className="btn icon ghost mobile-only"
            style={{ position: 'fixed', zIndex: 60, left: 8, top: 'max(14px, env(safe-area-inset-top))' }}
            onClick={() => setOpen(true)}
          >
            <Menu size={21} />
          </button>
        )}
        <Outlet />
      </main>

      {phone && <TabBar onMore={() => { haptic.tap(); setOpen(true); }} onSearch={() => { haptic.tap(); setCmd(true); }} />}

      {cmd && <CommandPalette onClose={() => setCmd(false)} />}
    </div>
  );
}

function Count({ value }: { value: number }) {
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 360);
      prev.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);
  return <span className={'count' + (bump ? ' count-bump' : '')}>{value}</span>;
}

function TabBar({ onMore, onSearch }: { onMore: () => void; onSearch: () => void }) {
  const loc = useLocation();
  const nav = useNavigate();
  const is = (p: string) => loc.pathname === p || (p === '/notes' && loc.pathname === '/');

  const go = (p: string) => () => { haptic.tap(); nav(p); };

  return (
    <nav className="tabbar">
      <div className="tabbar-inner">
        <button className={'tab' + (is('/notes') ? ' on' : '')} onClick={go('/notes')}>
          <StickyNote className="tab-ico" size={21} /> Notes
        </button>
        <button className={'tab' + (loc.pathname.startsWith('/collections') ? ' on' : '')} onClick={go('/collections')}>
          <FolderOpen className="tab-ico" size={21} /> Sets
        </button>
        <button className={'tab' + (loc.pathname.startsWith('/boards') ? ' on' : '')} onClick={go('/boards')}>
          <LayoutDashboard className="tab-ico" size={21} /> Boards
        </button>
        <button className="tab" onClick={onSearch}>
          <Search className="tab-ico" size={21} /> Search
        </button>
        <button className={'tab' + (is('/settings') ? ' on' : '')} onClick={onMore}>
          <Menu className="tab-ico" size={21} /> More
        </button>
      </div>
    </nav>
  );
}
