import type { Metadata } from 'next';
import { ListSection, ProsePage } from '@/components/marketing/prose-page';
import th from '@/messages/th.json';

const t = th.terms;

export const metadata: Metadata = {
  title: t.metaTitle,
  description: t.metaDescription,
  alternates: { canonical: '/terms' },
  openGraph: { title: t.metaTitle, description: t.metaDescription, url: '/terms', locale: 'th_TH' },
};

export default function TermsPage() {
  return (
    <ProsePage title={t.title} intro={t.intro} updated={t.updated}>
      {t.sections.map((s) => (
        <ListSection key={s.title} title={s.title} items={s.items} />
      ))}
    </ProsePage>
  );
}
