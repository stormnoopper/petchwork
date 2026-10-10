import thMap from '@/messages/th.map.json';

export const mapMessages = thMap;

/** Minimal `{name}` interpolation for th.map.json strings. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
