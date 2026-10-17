/**
 * Unit tests for API authentication module.
 */

import { describe, test, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  SESSION_COOKIE_OPTIONS,
} from '../src/auth.js';
import { resetPasswordSchema } from '@projectpilot/contracts';

describe('Auth Password Hashing', () => {
  test('hashes password and verifies successfully', async () => {
    const password = 'SecretPassword123!';
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2')).toBe(true);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  test('fails verification on wrong password', async () => {
    const hash = await hashPassword('CorrectPassword');
    const isValid = await verifyPassword('WrongPassword', hash);
    expect(isValid).toBe(false);
  });
});

describe('Session Tokens (JWT)', () => {
  const secret = 'super-secret-test-key-at-least-32-chars-long';
  const userId = '11111111-2222-3333-4444-555555555555';

  test('creates and verifies valid session token', async () => {
    const token = await createSessionToken(userId, secret);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const verified = await verifySessionToken(token, secret);
    expect(verified.userId).toBe(userId);
  });

  test('fails verification with wrong secret', async () => {
    const token = await createSessionToken(userId, secret);
    const wrongSecret = 'different-secret-key-at-least-32-chars!';

    await expect(verifySessionToken(token, wrongSecret)).rejects.toThrow();
  });

  test('fails verification with tampered token', async () => {
    const token = await createSessionToken(userId, secret);
    const tampered = token.slice(0, -5) + 'abcde';

    await expect(verifySessionToken(tampered, secret)).rejects.toThrow();
  });
});

describe('Cookie Configuration', () => {
  test('enforces secure defaults', () => {
    expect(SESSION_COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(SESSION_COOKIE_OPTIONS.sameSite).toBe('lax');
    expect(SESSION_COOKIE_OPTIONS.path).toBe('/');
    expect(SESSION_COOKIE_OPTIONS.maxAge).toBe(7 * 24 * 60 * 60);
  });
});

describe('Password Reset Schema & Hashing', () => {
  test('validates correct password reset payload', () => {
    const valid = resetPasswordSchema.safeParse({
      email: 'user@example.com',
      newPassword: 'BrandNewPassword123!',
      confirmPassword: 'BrandNewPassword123!',
    });
    expect(valid.success).toBe(true);
  });

  test('rejects short passwords under 8 characters', () => {
    const invalid = resetPasswordSchema.safeParse({
      email: 'user@example.com',
      newPassword: 'short',
    });
    expect(invalid.success).toBe(false);
  });

  test('rejects invalid email formats', () => {
    const invalid = resetPasswordSchema.safeParse({
      email: 'not-an-email',
      newPassword: 'BrandNewPassword123!',
    });
    expect(invalid.success).toBe(false);
  });

  test('hashes new password and verifies against updated hash', async () => {
    const newPass = 'UpdatedSecurePass123';
    const hash = await hashPassword(newPass);
    expect(await verifyPassword(newPass, hash)).toBe(true);
    expect(await verifyPassword('OldPass', hash)).toBe(false);
  });
});
