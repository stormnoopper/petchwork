import { describe, expect, it } from 'vitest';
import { RegisterInput } from '@rice/contracts';
import { appUserIdFromEmail, appUserIdFromGoogleSub, normalizeEmail } from './identity';
import { hashPassword, verifyPassword } from './password';

describe('password hashing (scrypt)', () => {
  it('verifies the right password, rejects a wrong one, salts every hash', async () => {
    const h1 = await hashPassword('รหัสผ่าน-ยาวพอ-123');
    const h2 = await hashPassword('รหัสผ่าน-ยาวพอ-123');
    expect(h1).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(h1).not.toBe(h2);
    expect(await verifyPassword('รหัสผ่าน-ยาวพอ-123', h1)).toBe(true);
    expect(await verifyPassword('รหัสผ่าน-ยาวพอ-124', h1)).toBe(false);
  });
  it('returns false for malformed hashes instead of throwing', async () => {
    for (const h of ['', 'bcrypt$x', 'scrypt$0$8$1$AA==$AA==', 'scrypt$32768$8$1$$']) {
      expect(await verifyPassword('x', h)).toBe(false);
    }
  });
});

describe('email identity', () => {
  it('normalises case/whitespace and never collides with Google ids', () => {
    expect(normalizeEmail('  Farmer@Example.COM ')).toBe('farmer@example.com');
    expect(appUserIdFromEmail('Farmer@Example.com')).toBe(appUserIdFromEmail('farmer@example.com '));
    expect(appUserIdFromEmail('a@b.co')).not.toBe(appUserIdFromGoogleSub('a@b.co'));
  });
});

describe('RegisterInput', () => {
  const ok = {
    name: 'สมชาย',
    email: 'somchai@example.com',
    password: '12345678',
    confirmPassword: '12345678',
    acceptTerms: true,
  };
  it('accepts a valid form', () => expect(RegisterInput.safeParse(ok).success).toBe(true));
  it.each([
    ['short password', { password: '1234567', confirmPassword: '1234567' }, 'password'],
    ['mismatch', { confirmPassword: '12345679' }, 'confirmPassword'],
    ['bad email', { email: 'not-an-email' }, 'email'],
    ['terms not accepted', { acceptTerms: false }, 'acceptTerms'],
    ['blank name', { name: '   ' }, 'name'],
  ])('rejects %s', (_l, patch, field) => {
    const r = RegisterInput.safeParse({ ...ok, ...patch });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toContain(field);
  });
});
