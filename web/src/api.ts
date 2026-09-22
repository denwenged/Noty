const base = '/api';

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(base + path, {
    credentials: 'include',
    headers:
      options.body instanceof FormData
        ? undefined
        : { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  get: <T,>(p: string) => req<T>(p),
  post: <T,>(p: string, body?: unknown) =>
    req<T>(p, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T,>(p: string, body?: unknown) =>
    req<T>(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T,>(p: string) => req<T>(p, { method: 'DELETE' }),
};

export type User = {
  id: number;
  username: string;
  email: string | null;
  isAdmin: boolean;
  accent: string;
  theme: string;
  avatar: string | null;
  createdAt: string;
};

export type NoteLink = {
  url: string;
  title?: string;
  description?: string;
  favicon?: string;
  image?: string | null;
};

export type Note = {
  id: number;
  title: string;
  content: string;
  color: string;
  icon: string | null;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  tags: string[];
  links: NoteLink[];
  reminderAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CanvasMode = 'infinite' | 'fixed';

export type BoardSummary = {
  id: number;
  name: string;
  background: string;
  canvasMode: CanvasMode;
  canvasW: number;
  canvasH: number;
  itemCount: number;
  updatedAt?: string;
};

export type BoardItem = {
  id: number;
  boardId: number;
  type: 'sticky' | 'link' | 'image' | 'text' | 'todo';
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  rotation: number;
  color: string;
  data: any;
};

export type Board = {
  id: number;
  name: string;
  background: string;
  canvasMode: CanvasMode;
  canvasW: number;
  canvasH: number;
  items: BoardItem[];
};

export const CANVAS_PRESETS: { label: string; w: number; h: number }[] = [
  { label: '1920 × 1080 · FHD', w: 1920, h: 1080 },
  { label: '1280 × 720 · HD', w: 1280, h: 720 },
  { label: '2560 × 1440 · QHD', w: 2560, h: 1440 },
  { label: '1080 × 1080 · Square', w: 1080, h: 1080 },
  { label: '1080 × 1920 · Story', w: 1080, h: 1920 },
  { label: '3508 × 2480 · A4', w: 3508, h: 2480 },
];

export type ImageFile = {
  id: string;
  filename: string;
  size: number;
  createdAt: string;
  url: string;
  thumbUrl: string;
};

export async function uploadImage(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return api.post<{ id: string; url: string; thumbUrl: string }>('/files', fd);
}
