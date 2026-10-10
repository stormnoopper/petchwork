/**
 * Landing colour tones (rice-field palette). Full literal class strings so Tailwind picks them up.
 * Text colours are -700/-800 on -50/-100 fills → WCAG AA on light backgrounds.
 */
export type Tone = 'green' | 'gold' | 'sky' | 'orange' | 'violet' | 'teal';

export const TONES: Record<
  Tone,
  { tile: string; text: string; bar: string; soft: string; border: string }
> = {
  green: {
    tile: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    text: 'text-emerald-700 dark:text-emerald-300',
    bar: 'from-emerald-400 to-green-600',
    soft: 'bg-emerald-50/70 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-900',
  },
  gold: {
    tile: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    text: 'text-amber-800 dark:text-amber-300',
    bar: 'from-yellow-400 to-amber-500',
    soft: 'bg-amber-50/70 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-900',
  },
  sky: {
    tile: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    text: 'text-sky-700 dark:text-sky-300',
    bar: 'from-sky-400 to-blue-600',
    soft: 'bg-sky-50/70 dark:bg-sky-950/30',
    border: 'border-sky-200 dark:border-sky-900',
  },
  orange: {
    tile: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
    text: 'text-orange-800 dark:text-orange-300',
    bar: 'from-orange-400 to-rose-500',
    soft: 'bg-orange-50/70 dark:bg-orange-950/30',
    border: 'border-orange-200 dark:border-orange-900',
  },
  violet: {
    tile: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    text: 'text-violet-700 dark:text-violet-300',
    bar: 'from-violet-400 to-purple-600',
    soft: 'bg-violet-50/70 dark:bg-violet-950/30',
    border: 'border-violet-200 dark:border-violet-900',
  },
  teal: {
    tile: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
    text: 'text-teal-700 dark:text-teal-300',
    bar: 'from-teal-400 to-cyan-600',
    soft: 'bg-teal-50/70 dark:bg-teal-950/30',
    border: 'border-teal-200 dark:border-teal-900',
  },
};

/** Decorative paddy-terrace waves for section edges (aria-hidden by caller). */
export const WAVE_PATH =
  'M0 40 C 120 10 240 10 360 30 S 600 60 720 36 S 960 0 1080 24 S 1320 56 1440 30 L1440 80 L0 80 Z';
