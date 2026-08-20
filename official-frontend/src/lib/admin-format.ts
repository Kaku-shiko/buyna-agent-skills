const TZ = "Asia/Tokyo";

export function fmtJpy(n: number | null | undefined): string {
  return `¥${(n ?? 0).toLocaleString("ja-JP")}`;
}

export function fmtTokyo(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", { timeZone: TZ });
  } catch {
    return iso;
  }
}

export function fmtTokyoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ja-JP", { timeZone: TZ });
  } catch {
    return iso;
  }
}

/**
 * Build a UTC range [from, to) for the given calendar month (Tokyo-local).
 * monthStr like "2025-03"; defaults to current Tokyo month.
 */
export function monthRangeTokyo(monthStr?: string): { from: string; to: string } {
  const now = new Date();
  const tokyoNow = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const [y, m] = monthStr
    ? monthStr.split("-").map(Number)
    : [tokyoNow.getFullYear(), tokyoNow.getMonth() + 1];
  // Tokyo is UTC+9 with no DST
  const fromUtc = new Date(Date.UTC(y, (m ?? 1) - 1, 1, -9, 0, 0));
  const toUtc = new Date(Date.UTC(y, m ?? 1, 1, -9, 0, 0));
  return { from: fromUtc.toISOString(), to: toUtc.toISOString() };
}

export function todayRangeTokyo(): { from: string; to: string } {
  const now = new Date();
  const tokyo = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const y = tokyo.getFullYear();
  const m = tokyo.getMonth();
  const d = tokyo.getDate();
  const fromUtc = new Date(Date.UTC(y, m, d, -9, 0, 0));
  const toUtc = new Date(Date.UTC(y, m, d + 1, -9, 0, 0));
  return { from: fromUtc.toISOString(), to: toUtc.toISOString() };
}

/** Convert objects to CSV string. Quotes/escapes per RFC 4180. */
export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.join(",");
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
