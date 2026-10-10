import type { Metadata } from 'next';
import { ProsePage } from '@/components/marketing/prose-page';
import th from '@/messages/th.json';

const t = th.about;

export const metadata: Metadata = {
  title: t.metaTitle,
  description: t.metaDescription,
  alternates: { canonical: '/about' },
  openGraph: { title: t.metaTitle, description: t.metaDescription, url: '/about', locale: 'th_TH' },
};

export default function AboutPage() {
  return (
    <ProsePage title={t.title} intro={t.intro}>
      {t.sections.map((s) => (
        <section key={s.title} className="space-y-3">
          <h2 className="text-xl font-semibold">{s.title}</h2>
          <p>{s.body}</p>
        </section>
      ))}
      <section id="contact" className="scroll-mt-20 space-y-3">
        <h2 className="text-xl font-semibold">{t.contactTitle}</h2>
        <p>{t.contactBody}</p>
      </section>
    </ProsePage>
  );
}
