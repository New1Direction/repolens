export const DEFAULT_THEME = 'midnight';

export const THEMES = [
  { key: 'midnight',  label: 'Midnight',  swatch: '#0a0a0f' },
  { key: 'paper',     label: 'Paper',     swatch: '#f7f7fb' },
  { key: 'terminal',  label: 'Terminal',  swatch: '#07100b' },
  { key: 'synthwave', label: 'Synthwave', swatch: 'linear-gradient(135deg, #e879f9, #22d3ee)' },
  { key: 'bmw',       label: 'BMW M',     swatch: 'linear-gradient(90deg, #0066b1 33%, #1c69d4 33% 66%, #e22718 66%)' },
  { key: 'xai',       label: 'xAI',       swatch: 'linear-gradient(135deg, #0a0a0a 50%, #f5f0e8 50%)' },
  { key: 'claude',    label: 'Claude',    swatch: '#cc785c' },
  { key: 'apple',     label: 'Apple',     swatch: '#0066cc' },
];

function isKnown(key) {
  return THEMES.some(t => t.key === key);
}

export function applyTheme(key) {
  const theme = isKnown(key) ? key : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}

export async function initTheme() {
  const { theme } = await chrome.storage.local.get('theme');
  return applyTheme(theme ?? DEFAULT_THEME);
}

export async function saveTheme(key) {
  const theme = applyTheme(key);
  await chrome.storage.local.set({ theme });
  return theme;
}
