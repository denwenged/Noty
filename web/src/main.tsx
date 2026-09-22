import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './store';
import Shell from './Shell';
import Auth from './pages/Auth';
import Notes from './pages/Notes';
import Boards from './pages/Boards';
import Collections from './pages/Collections';
import CollectionView from './pages/CollectionView';
import Board from './pages/Board';
import SettingsPage from './pages/Settings';
import Admin from './pages/Admin';
import Shared from './pages/Shared';
import './styles.css';

function Gate() {
  const { user, loading } = useApp();
  if (loading)
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100dvh' }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  return (
    <Routes>
      <Route path="/s/:slug" element={<Shared />} />
      {!user ? (
        <Route path="*" element={<Auth />} />
      ) : (
        <Route element={<Shell />}>
          <Route path="/" element={<Navigate to="/notes" replace />} />
          <Route path="/notes" element={<Notes view="all" />} />
          <Route path="/pinned" element={<Notes view="pinned" />} />
          <Route path="/archive" element={<Notes view="archive" />} />
          <Route path="/trash" element={<Notes view="trash" />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collections/:id" element={<CollectionView />} />
          <Route path="/boards" element={<Boards />} />
          <Route path="/boards/:id" element={<Board />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/notes" replace />} />
        </Route>
      )}
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Gate />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);
