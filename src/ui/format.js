const moneyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function money(n) {
  const r = Math.round(n);
  return `${r < 0 ? '-' : ''}$${moneyFmt.format(Math.abs(r))}`;
}

export function signedMoney(n) {
  return `${n >= 0 ? '+' : '-'}${money(Math.abs(n))}`;
}

export function price(n) {
  return `$${n.toFixed(2)}`;
}

export function tonnes(n) {
  return `${n.toFixed(1)} t`;
}

export function pct(fraction) {
  return `${Math.round(fraction * 100)}%`;
}

export function clockTime({ day, hour, minute }) {
  return `Day ${day} · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function statValue(line) {
  const v = line.value;
  const digits = Number.isInteger(v) ? 0 : v < 10 ? 1 : 0;
  return `${v.toFixed(digits)}${line.unit ? ` ${line.unit}` : ''}`;
}

export function conditionColor(condition, broken) {
  if (broken) return '#d9534f';
  if (condition > 60) return '#5cb85c';
  if (condition > 30) return '#f0ad4e';
  return '#d9534f';
}
