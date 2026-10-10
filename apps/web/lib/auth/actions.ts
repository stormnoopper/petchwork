'use server';
import { AuthError, CredentialsSignin } from 'next-auth';
import { LoginInput, RegisterInput } from '@rice/contracts';
import { signIn } from '@/auth';
import { registerUser } from '@/lib/auth/credentials';
import { safeNext } from '@/lib/auth/safe-next';
import t from '@/messages/th.auth.json';

export type LoginState = { error: string | null; email: string };
export type RegisterField = 'name' | 'email' | 'password' | 'confirmPassword' | 'acceptTerms';
export type RegisterState = {
  error: string | null;
  fieldErrors: Partial<Record<RegisterField, string>>;
  values: { name: string; email: string };
};

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === 'string' ? v : '';
};

/** signIn throws NEXT_REDIRECT on success (must propagate) and AuthError on failure. */
async function signInWithPassword(email: string, password: string, next: string): Promise<string | null> {
  try {
    await signIn('credentials', { email, password, redirectTo: safeNext(next) });
    return null;
  } catch (e) {
    if (e instanceof CredentialsSignin) {
      return e.code === 'locked' ? t.login.errors.locked : t.login.errors.invalid;
    }
    if (e instanceof AuthError) return t.login.errors.generic;
    throw e;
  }
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = str(form, 'email');
  const parsed = LoginInput.safeParse({ email, password: str(form, 'password') });
  if (!parsed.success) return { error: t.login.errors.invalidInput, email };
  const error = await signInWithPassword(parsed.data.email, parsed.data.password, str(form, 'next'));
  return { error, email };
}

export async function registerAction(_prev: RegisterState, form: FormData): Promise<RegisterState> {
  const values = { name: str(form, 'name'), email: str(form, 'email') };
  const parsed = RegisterInput.safeParse({
    ...values,
    password: str(form, 'password'),
    confirmPassword: str(form, 'confirmPassword'),
    acceptTerms: form.get('acceptTerms') === 'on',
  });
  if (!parsed.success) {
    const fieldErrors: RegisterState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0] as RegisterField;
      if (k in t.register.errors) fieldErrors[k] ??= t.register.errors[k];
    }
    return { error: null, fieldErrors, values };
  }

  let res;
  try {
    res = await registerUser(parsed.data);
  } catch (e) {
    console.error('[register]', e);
    return { error: t.register.errors.generic, fieldErrors: {}, values };
  }
  if (!res.ok) return { error: null, fieldErrors: { email: t.register.errors.emailTaken }, values };

  const error = await signInWithPassword(parsed.data.email, parsed.data.password, str(form, 'next'));
  return { error, fieldErrors: {}, values };
}
