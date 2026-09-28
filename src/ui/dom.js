// Minimal DOM helper: el('div', { class: 'x', onClick: fn }, 'text', child)

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (typeof v === 'boolean' || typeof v === 'number') node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// Sets text only when it changed (cheap to call every frame).
export function setText(node, text) {
  const s = String(text);
  if (node.textContent !== s) node.textContent = s;
}

export function progressBar(cls = '') {
  const fill = el('div', { class: 'bar-fill' });
  const bar = el('div', { class: `bar ${cls}` }, fill);
  return {
    node: bar,
    set(fraction, color) {
      const pct = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
      if (fill.style.width !== pct) fill.style.width = pct;
      if (color && fill.style.background !== color) fill.style.background = color;
    },
  };
}

// A keycap, e.g. kbd('E'). Mouse buttons get their own look.
export function kbd(label) {
  const mouse = /mouse|LMB|RMB/i.test(label);
  return el('span', { class: `kbd${mouse ? ' mouse' : ''}` }, label);
}

const ICONS = {
  pause: '<svg viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="0.8"/><rect x="7" y="1.5" width="3" height="9" rx="0.8"/></svg>',
  play: '<svg viewBox="0 0 12 12"><path d="M3 1.5v9l7.5-4.5z"/></svg>',
};

export function icon(name) {
  const span = document.createElement('span');
  span.style.display = 'inline-flex';
  span.innerHTML = ICONS[name];
  return span;
}
