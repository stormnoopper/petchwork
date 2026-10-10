'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import {
  type CreateFieldRequest,
  type LatLng,
  type PolygonGeoJSON,
  type Practices,
} from '@rice/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fetchSessionUserId } from '@/lib/auth/client-session';
import { parseCreatedField } from '@/lib/display/created-field';
import { loginUrlForDraft, saveDraft } from '@/lib/display/draft';
import th from '@/messages/th.json';

const t = th.results.save;

/** "บันทึกแปลงนี้" → login (with draft) or name + PDPA consent dialog → POST /api/fields → /fields/[id]. */
export function SaveFieldButton({
  vertices,
  polygon,
  practices,
  defaultName,
  className,
}: {
  vertices: LatLng[];
  polygon: PolygonGeoJSON;
  practices: Practices;
  defaultName: string;
  className?: string;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const goLogin = () => {
    if (!saveDraft(vertices, practices)) setNotice(t.storageError);
    router.push(loginUrlForDraft());
  };

  const onClick = async () => {
    setChecking(true);
    const uid = await fetchSessionUserId();
    setChecking(false);
    if (!uid) {
      goLogin();
      return;
    }
    setError(null);
    setName((n) => n || defaultName);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t.nameRequired);
    if (!consent) return setError(t.consentRequired);
    setSubmitting(true);
    setError(null);
    try {
      const body: CreateFieldRequest = {
        name: name.trim().slice(0, 100),
        vertices,
        polygon,
        practices,
      };
      const res = await fetch('/api/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        setOpen(false);
        goLogin();
        return;
      }
      const field = res.ok ? parseCreatedField(await res.json().catch(() => null)) : null;
      if (!field) throw new Error(`HTTP ${res.status}`);
      router.push(`/fields/${field.id}`);
    } catch {
      setError(t.error);
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        className={className ?? 'h-12 w-full text-base'}
        onClick={onClick}
        disabled={checking}
      >
        {checking ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <Save className="size-5" aria-hidden />
        )}
        {checking ? t.checking : t.button}
      </Button>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={(o) => !submitting && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <DialogHeader>
              <DialogTitle className="text-lg">{t.dialogTitle}</DialogTitle>
              <DialogDescription className="text-base">{t.dialogDescription}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1">
              <label htmlFor="field-name" className="text-base font-medium">
                {t.nameLabel}
              </label>
              <Input
                id="field-name"
                className="h-11 text-base"
                value={name}
                maxLength={100}
                placeholder={t.namePlaceholder}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-base">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
              />
              <span>
                {t.consent}{' '}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  {t.consentLink}
                </Link>
              </span>
            </label>
            {error ? (
              <p role="alert" className="text-base text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 text-base"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                {t.cancel}
              </Button>
              <Button type="submit" className="h-11 text-base" disabled={submitting || !consent}>
                {submitting ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
                {submitting ? t.submitting : t.submit}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
