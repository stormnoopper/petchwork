import type { Metadata } from 'next';
import { ListSection, ProsePage } from '@/components/marketing/prose-page';
import th from '@/messages/th.json';

const t = th.privacy;

export const metadata: Metadata = {
  title: t.metaTitle,
  description: t.metaDescription,
  alternates: { canonical: '/privacy' },
  openGraph: { title: t.metaTitle, description: t.metaDescription, url: '/privacy', locale: 'th_TH' },
};

export default function PrivacyPage() {
  return (
    <ProsePage title={t.title} intro={t.intro} updated={t.updated}>
      {t.sections.map((s) => (
        <ListSection key={s.title} title={s.title} items={s.items} />
      ))}
      <p className="rounded-lg bg-muted p-4">{t.consentNote}</p>
    </ProsePage>
  );
}
