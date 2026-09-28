// A stack of pop-up panels (menus, shop, market...). Pausing overlays stop the game clock.
import { el, kbd } from './dom.js';

export function createOverlayStack(root, { onEmpty } = {}) {
  const layer = el('div', { class: 'overlay-layer' });
  root.append(layer);
  const stack = [];

  function focusFirst(panel) {
    const target = panel.querySelector('[autofocus]') ?? panel.querySelector('button:not([disabled]):not(.overlay-close)');
    target?.focus({ preventScroll: true });
  }

  function open({ id, title, build, pauses = true, className = '', onClose }) {
    if (isOpen(id)) return null;
    const panel = el('div', { class: `overlay-panel ${className}` });
    const backdrop = el('div', { class: `overlay ${pauses ? 'overlay-dim' : ''}` }, panel);
    const entry = { id, pauses, node: backdrop, panel, onClose, update: null };
    if (title) {
      panel.append(el('div', { class: 'overlay-head' },
        el('h2', { class: 'overlay-title' }, title),
        el('button', { class: 'btn btn-ghost btn-small overlay-close', onClick: () => close(id) }, kbd('Esc'), 'Close')));
    }
    panel.append(build({ close: () => close(id), entry }));
    if (!pauses) {
      backdrop.addEventListener('mousedown', (e) => {
        if (e.target === backdrop) close(id);
      });
    }
    layer.append(backdrop);
    stack.push(entry);
    focusFirst(panel);
    return entry;
  }

  function close(id) {
    const i = stack.findIndex((o) => o.id === id);
    if (i < 0) return;
    const [entry] = stack.splice(i, 1);
    entry.node.remove();
    entry.onClose?.();
    const top = stack[stack.length - 1];
    if (top) focusFirst(top.panel);
    else onEmpty?.();
  }

  function isOpen(id) {
    return stack.some((o) => o.id === id);
  }

  return {
    open,
    close,
    isOpen,
    toggle(opts) {
      if (isOpen(opts.id)) close(opts.id);
      else open(opts);
    },
    closeTop() {
      const top = stack[stack.length - 1];
      if (!top) return false;
      close(top.id);
      return true;
    },
    closeAll() {
      while (stack.length) close(stack[stack.length - 1].id);
    },
    top: () => stack[stack.length - 1] ?? null,
    count: () => stack.length,
    anyPausing: () => stack.some((o) => o.pauses),
    update(dt) {
      for (const o of stack) o.update?.(dt);
    },
  };
}

// Simple yes/no question.
export function confirmBox(overlays, { id = 'confirm', title, text, yes = 'Yes', no = 'Cancel', onYes }) {
  overlays.open({
    id,
    title,
    className: 'overlay-small',
    build: ({ close }) => el('div', {},
      el('p', { class: 'overlay-text' }, text),
      el('div', { class: 'menu-buttons row' },
        el('button', { class: 'btn', onClick: close, autofocus: true }, no),
        el('button', { class: 'btn btn-primary', onClick: () => { close(); onYes(); } }, yes),
      ),
    ),
  });
}
