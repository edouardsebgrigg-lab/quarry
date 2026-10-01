// Line icons for the laptop's apps (24×24, drawn with the current text colour).
const PATHS = {
  home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
  digger: '<path d="M3 18h10"/><rect x="4" y="12" width="8" height="4" rx="1"/><path d="M7 12V9h4l1 3"/><path d="M12 11l5-5 3 3"/><path d="M20 9l-1 5-3-1"/><circle cx="5.5" cy="18" r="1.3"/><circle cx="11.5" cy="18" r="1.3"/>',
  chart: '<path d="M4 19h16"/><path d="M5 15l4-4 3 3 6-7"/><path d="M15 7h3v3"/>',
  bank: '<path d="M3 9l9-5 9 5"/><path d="M5 9v8M9.5 9v8M14.5 9v8M19 9v8"/><path d="M3 19h18"/>',
  truck: '<path d="M3 16V8h10v8"/><path d="M13 11h4l3 3v2h-7"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/>',
  mail: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M4 7l8 6 8-6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  wrench: '<path d="M15.5 4.5a4 4 0 0 0-5 5L4 16l4 4 6.5-6.5a4 4 0 0 0 5-5L17 11l-4-4z"/>',
  building: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2a4.5 4.5 0 0 1 5 4.8"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4"/><path d="M8.5 20h7"/><path d="M10 17h4v3h-4z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8.5 10h7M8.5 14h7M8.5 18h4"/>',
};

export function lineIcon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `lt-icon ${cls}`;
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] ?? ''}</svg>`;
  return span;
}
