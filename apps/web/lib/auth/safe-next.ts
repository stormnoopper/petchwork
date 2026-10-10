/** Only allow same-origin relative redirects (`/foo`), never `//evil.com`, `/\evil.com` or absolute URLs. */
export function safeNext(next: string | null | undefined, fallback = '/map'): string {
  if (!next || typeof next !== 'string') return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  // control chars (e.g. tab/newline) can be stripped by URL parsers and turn `/\t/evil.com` into `//evil.com`
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
