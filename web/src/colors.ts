/** Note card palettes — warm paper tints in light, muted ink washes in dark. */
export const NOTE_COLORS: Record<
  string,
  { label: string; light: string; lightBr: string; dark: string; darkBr: string }
> = {
  default: { label: 'Paper',  light: '#ffffff', lightBr: '#e8e3da', dark: '#191823', darkBr: '#2a2836' },
  blush:   { label: 'Blush',  light: '#ffe9ef', lightBr: '#f8ccd8', dark: '#2b1b25', darkBr: '#48293a' },
  apricot: { label: 'Apricot',light: '#ffeedb', lightBr: '#f7d6ae', dark: '#2c2119', darkBr: '#4a3524' },
  butter:  { label: 'Butter', light: '#fff7d1', lightBr: '#f2e3a0', dark: '#2a2718', darkBr: '#474023' },
  matcha:  { label: 'Matcha', light: '#e8f6da', lightBr: '#c8e6ab', dark: '#1d2719', darkBr: '#2f4526' },
  lagoon:  { label: 'Lagoon', light: '#d9f4f0', lightBr: '#a8e2da', dark: '#152826', darkBr: '#204540' },
  sky:     { label: 'Sky',    light: '#dcedff', lightBr: '#b0d4f7', dark: '#172433', darkBr: '#254059' },
  lilac:   { label: 'Lilac',  light: '#ece4ff', lightBr: '#cfc0f7', dark: '#221d33', darkBr: '#3a2f57' },
};

/** Sticky note colours — always the bright paper tones, on any theme. */
export const STICKY_COLORS: Record<string, string> = {
  yellow: '#ffe066',
  apricot: '#ffbe7d',
  blush: '#ffa8bf',
  matcha: '#c2e88a',
  mint: '#8fe6c4',
  sky: '#94d2ff',
  lilac: '#c4b2ff',
  paper: '#f7f3e8',
};

export const ACCENTS = ['violet', 'ocean', 'lime', 'sunset', 'candy', 'mint'] as const;
export const ACCENT_HEX: Record<string, string> = {
  violet: '#6d5efc',
  ocean: '#1e8fd5',
  lime: '#57a300',
  sunset: '#f2681f',
  candy: '#e5326b',
  mint: '#0aa87e',
};

export function noteBg(color: string, theme: string) {
  const c = NOTE_COLORS[color] || NOTE_COLORS.default;
  return theme === 'light' ? c.light : c.dark;
}
export function noteBorder(color: string, theme: string) {
  const c = NOTE_COLORS[color] || NOTE_COLORS.default;
  return theme === 'light' ? c.lightBr : c.darkBr;
}

/** Best-effort favicon for a URL. */
export function faviconFor(url: string) {
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`;
  } catch {
    return '';
  }
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
