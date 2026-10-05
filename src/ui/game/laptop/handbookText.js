import { DEFAULT_BINDINGS, keyLabel } from '../../../input/index.js';

export function handbookText(text, bindings = DEFAULT_BINDINGS) {
  return text.replace(/\{(\w+)\}/g, (_, action) => keyLabel(bindings[action]));
}

export function searchHandbook(articles, query) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return articles.filter(a => {
    const text = [a.title, a.category, a.summary, ...a.steps, a.trouble].join(' ').toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
}
