/**
 * Tiny haptic helper. Uses the Vibration API (Android/Chrome).
 * iOS Safari ignores navigator.vibrate, so visual feedback always
 * accompanies these calls rather than relying on them.
 */
const can = () => typeof navigator !== 'undefined' && 'vibrate' in navigator;

let enabled = true;
export function setHaptics(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem('noty_haptics', on ? '1' : '0');
  } catch {}
}
export function hapticsEnabled() {
  try {
    return localStorage.getItem('noty_haptics') !== '0';
  } catch {
    return true;
  }
}
enabled = hapticsEnabled();

const fire = (pattern: number | number[]) => {
  if (!enabled || !can()) return;
  try {
    navigator.vibrate(pattern);
  } catch {}
};

export const haptic = {
  /** light tick — taps, toggles, selection */
  tap: () => fire(8),
  /** slightly firmer — picking an item up, opening a sheet */
  press: () => fire(14),
  /** success — saved, created, completed */
  success: () => fire([10, 40, 18]),
  /** warning / destructive */
  warn: () => fire([22, 50, 22]),
  /** item snapped into place */
  snap: () => fire(5),
};
