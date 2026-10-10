import th from '@/messages/th.json';

/**
 * "เว็บไซต์นี้เป็นส่วนหนึ่งของงานวิจัย “…” ของ …" — edit title/researcher in messages/th.json → research.
 * The researcher's name never breaks across lines (Thai word segmentation would split it).
 */
export function ResearchNote({ className }: { className?: string }) {
  const [before, after = ''] = th.research.note.split('{researcher}');
  return (
    <p className={className}>
      {before!.replace('{title}', th.research.title)}
      <span className="whitespace-nowrap">{th.research.researcher}</span>
      {after}
    </p>
  );
}
