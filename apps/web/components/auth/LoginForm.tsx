'use client';
import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { loginAction, type LoginState } from '@/lib/auth/actions';
import { cn } from '@/lib/utils';
import t from '@/messages/th.auth.json';
import { TextField } from './fields';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {
    error: null,
    email: '',
  });
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <TextField
        label={t.login.email}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.email}
      />
      <TextField
        label={t.login.password}
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
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
        {pending ? t.login.submitting : t.login.submit}
      </button>
    </form>
  );
}
