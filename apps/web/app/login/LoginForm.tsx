'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import t from '@/messages/th.auth.json';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorText(err: { status?: number; code?: string } | null): string {
  if (!err) return t.login.errors.generic;
  if (err.status === 429 || err.code === 'over_email_send_rate_limit') return t.login.errors.rateLimited;
  return t.login.errors.generic;
}

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function sendLink(e?: FormEvent) {
    e?.preventDefault();
    const addr = email.trim();
    if (!EMAIL_RE.test(addr)) {
      setError(t.login.errors.invalidEmail);
      return;
    }
    setBusy(true);
    setError(null);
    const redirect = new URL('/auth/callback', window.location.origin);
    redirect.searchParams.set('next', next);
    const { error: err } = await createClient().auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: redirect.toString(), shouldCreateUser: true },
    });
    setBusy(false);
    if (err) {
      setError(errorText(err));
      return;
    }
    setStep('otp');
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    const token = otp.replace(/\s/g, '');
    if (!/^\d{6,10}$/.test(token)) {
      setError(t.login.errors.invalidOtp);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.verifyOtp({ email: email.trim(), token, type: 'email' });
    setBusy(false);
    if (err) {
      setError(t.login.errors.invalidOtp);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold leading-snug">{t.login.title}</h1>
        <p className="text-muted-foreground text-base">{t.login.subtitle}</p>
      </div>

      {step === 'email' ? (
        <form onSubmit={sendLink} className="flex flex-col gap-3" noValidate>
          <Label htmlFor="email" className="text-base">
            {t.login.emailLabel}
          </Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            required
            placeholder={t.login.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            className="h-12 text-base"
          />
          <Button type="submit" disabled={busy} className="h-12 text-base">
            {busy ? t.login.sending : t.login.sendLink}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3" noValidate>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm" role="status">
            <p className="font-medium">{t.login.sentTitle}</p>
            <p className="text-muted-foreground">{t.login.sentBody.replace('{email}', email.trim())}</p>
          </div>
          <Label htmlFor="otp" className="text-base">
            {t.login.otpLabel}
          </Label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={10}
            placeholder={t.login.otpPlaceholder}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            aria-invalid={error ? true : undefined}
            className="h-12 text-center text-lg tracking-[0.4em]"
          />
          <Button type="submit" disabled={busy} className="h-12 text-base">
            {busy ? t.login.verifying : t.login.verify}
          </Button>
          <div className="flex justify-between text-sm">
            <Button type="button" variant="link" onClick={() => setStep('email')}>
              {t.login.changeEmail}
            </Button>
            <Button type="button" variant="link" disabled={busy} onClick={() => void sendLink()}>
              {t.login.resend}
            </Button>
          </div>
        </form>
      )}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {/* TODO(phase-later): phone OTP — signInWithOtp({ phone }) once an SMS provider is configured in supabase/config.toml [auth.sms] */}
      <p className="text-muted-foreground text-sm">{t.login.phoneSoon}</p>

      <div className="flex flex-col gap-2 text-sm">
        <Link href="/privacy" className="text-primary underline-offset-4 hover:underline">
          {t.login.privacyLink}
        </Link>
        <Link href={next} className="text-muted-foreground underline-offset-4 hover:underline">
          {t.login.backToMap}
        </Link>
      </div>
    </div>
  );
}
