export function pickNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatNumber(value: unknown): string {
  return pickNumber(value).toLocaleString("th-TH");
}

export function formatDateTime(value: unknown): string {
  if (!value) return "-";
  const dt = new Date(value as string);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("th-TH");
}
