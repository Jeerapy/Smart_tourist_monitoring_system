export function formatISOToDDMMYYYY(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = String(iso).trim();
  const normalized = t.replace(/\//g, "-").replace(/\s+/g, "");
  const parts = normalized.split("-");
  if (parts.length !== 3) return "";
  const [a, b, c] = parts;
  if (a.length === 4) {
    // YYYY-MM-DD
    const yyyy = a;
    const mm = b;
    const dd = c;
    if (yyyy.length !== 4 || mm.length !== 2 || dd.length !== 2) return "";
    return `${dd}-${mm}-${yyyy}`;
  }
  if (c.length === 4) {
    // DD-MM-YYYY
    const dd = a;
    const mm = b;
    const yyyy = c;
    if (yyyy.length !== 4 || mm.length !== 2 || dd.length !== 2) return "";
    return `${dd}-${mm}-${yyyy}`;
  }
  return "";
}

export function convertDDMMYYYYToISO(input: string): string | null {
  const t = (input ?? "").toString().trim();
  if (!t) return null;

  // Accept '-' or '/' separators.
  const normalized = t.replace(/\//g, "-").replace(/\s+/g, "");
  const parts = normalized.split("-");
  if (parts.length !== 3) return null;

  const [a, b, c] = parts;

  let yyyy: number;
  let mm: number;
  let dd: number;

  // Support both "DD-MM-YYYY" and "YYYY-MM-DD"
  if (a.length === 4) {
    // YYYY-MM-DD
    yyyy = Number(a);
    mm = Number(b);
    dd = Number(c);
  } else if (c.length === 4) {
    // DD-MM-YYYY
    dd = Number(a);
    mm = Number(b);
    yyyy = Number(c);
  } else {
    return null;
  }

  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null;

  // Validate by constructing a date and comparing components.
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (Number.isNaN(dt.getTime())) return null;
  const valid =
    dt.getUTCFullYear() === yyyy && dt.getUTCMonth() === mm - 1 && dt.getUTCDate() === dd;
  if (!valid) return null;

  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}

