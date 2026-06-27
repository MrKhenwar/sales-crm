/**
 * Phone normalization for matching device call-log entries against Lead.phone.
 * The CRM stores E.164 (+91…); the Android call log may give us raw "9876543210",
 * "09876543210", "+919876543210", "919876543210", etc. We compare on the last
 * 10 digits (Indian mobile length); change DIGIT_TAIL_LEN for other markets.
 */
const DIGIT_TAIL_LEN = 10;

export function digitsOnly(s: string): string {
  return (s ?? "").replace(/[^\d]/g, "");
}

export function phoneTail(s: string): string {
  const d = digitsOnly(s);
  if (d.length <= DIGIT_TAIL_LEN) return d;
  return d.slice(-DIGIT_TAIL_LEN);
}

export function phonesMatch(a: string, b: string): boolean {
  const ta = phoneTail(a);
  const tb = phoneTail(b);
  return ta.length > 0 && ta === tb;
}
