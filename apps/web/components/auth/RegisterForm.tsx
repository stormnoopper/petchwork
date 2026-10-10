'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { PASSWORD_MAX, PASSWORD_MIN } from '@rice/contracts';
import { buttonVariants } from '@/components/ui/button';
import { registerAction, type RegisterState } from '@/lib/auth/actions';
import { cn } from '@/lib/utils';
import t from '@/messages/th.auth.json';
import { TextField } from './fields';

const r = t.register;

export function RegisterForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction, {
    error: null,
    fieldErrors: {},
    values: { name: '', email: '' },
  });
  const fe = state.fieldErrors;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <TextField
        label={r.name}
        name="name"
        autoComplete="name"
        required
        maxLength={100}
        defaultValue={state.values.name}
        error={fe.name}
      />
      <TextField
        label={r.email}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values.email}
        error={fe.email}
      />
      <TextField
        label={r.password}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        maxLength={PASSWORD_MAX}
        hint={r.passwordHint}
        error={fe.password}
      />
      <TextField
        label={r.confirmPassword}
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={fe.confirmPassword}
      />
      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-base">
          <input
            type="checkbox"
            name="acceptTerms"
            className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]"
            aria-invalid={fe.acceptTerms ? true : undefined}
          />
          <span>
            {r.acceptTermsBefore}{' '}
            <Link href="/terms" target="_blank" className="text-primary underline underline-offset-4">
              {r.terms}
            </Link>{' '}
            {r.and}{' '}
            <Link href="/privacy" target="_blank" className="text-primary underline underline-offset-4">
              {r.privacy}
            </Link>
          </span>
        </label>
        {fe.acceptTerms ? <p className="text-sm text-destructive">{fe.acceptTerms}</p> : null}
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={cn(buttonVariants(), 'h-12 rounded-full text-base')}
      >
        {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
        {pending ? r.submitting : r.submit}
      </button>
    </form>
  );
}
