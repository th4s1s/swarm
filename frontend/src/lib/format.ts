export function bytes(n: number | null | undefined): string {
  if (!n || n < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export function tokens(n: number | null | undefined): string {
  if (!n) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function usd(n: number | null | undefined): string {
  if (n == null) return '-';
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function shortSha(s: string | null | undefined): string {
  return s ? s.slice(0, 8) : '-';
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '-';
  const diff = Date.now() - t;
  const abs = Math.abs(diff);
  const fut = diff < 0;
  const m = Math.round(abs / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return fut ? `in ${m}m` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return fut ? `in ${h}h` : `${h}h ago`;
  const d = Math.round(h / 24);
  return fut ? `in ${d}d` : `${d}d ago`;
}

export function untilTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '-';
  const diff = t - Date.now();
  if (diff <= 0) return 'now';
  const m = Math.round(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
export function severityRank(s: string | null | undefined): number {
  return SEV_ORDER[(s ?? 'info').toLowerCase()] ?? 5;
}
