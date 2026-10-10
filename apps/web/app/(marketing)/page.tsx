import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import th from '@/messages/th.json';

// Placeholder — full landing page is task 1.12 (frontend-ui)
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">{th.landing.heroTitle}</h1>
      <p className="text-lg">{th.landing.heroSubtitle}</p>
      <Link href="/map" className={cn(buttonVariants({ size: 'lg' }), 'h-12 text-lg')}>
        {th.landing.ctaStart}
      </Link>
    </main>
  );
}
