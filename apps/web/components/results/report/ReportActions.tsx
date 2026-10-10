'use client';
import { Printer, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import th from '@/messages/th.json';

const t = th.fields.report;

/** Web Share API with copy-link fallback. */
export async function shareOrCopy(
  title: string,
  url: string,
): Promise<'shared' | 'copied' | 'failed' | 'cancelled'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function ReportActions({ title }: { title: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button
        type="button"
        variant="outline"
        className="h-11 px-4 text-base"
        onClick={async () => {
          const r = await shareOrCopy(title, window.location.href);
          if (r === 'copied') toast.success(t.copied);
          if (r === 'failed') toast.error(t.copyFailed);
        }}
      >
        <Share2 className="size-5" aria-hidden />
        {t.share}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 px-4 text-base"
        onClick={() => window.print()}
      >
        <Printer className="size-5" aria-hidden />
        {t.print}
      </Button>
    </div>
  );
}
