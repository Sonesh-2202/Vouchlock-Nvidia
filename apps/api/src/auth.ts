/**
 * Authentication utilities.
 * JWT session tokens in HTTP-only SameSite cookies.
 * Identity derived from verified session — never trust client-supplied user IDs.
 */

import * as jose from 'jose';
import bcrypt from 'bcryptjs';
import type { FastifyRequest, FastifyReply } from 'fastify';

const SALT_ROUNDS = 12;
const TOKEN_TTL = '7d';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export const SESSION_COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60,
};

export async function createSessionToken(userId: string, secret: string): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey);
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<{ userId: string }> {
  const secretKey = new TextEncoder().encode(secret);
  const { payload } = await jose.jwtVerify(token, secretKey);
  if (!payload.sub) {
    throw new Error('Invalid token: missing subject');
  }
  return { userId: payload.sub };
}

/**
 * Fastify request decorator to extract authenticated user ID.
 * Returns 401 if no valid session cookie present.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  jwtSecret: string,
  cookieName: string,
): Promise<string> {
  const cookieToken = (request.cookies as Record<string, string | undefined>)?.[cookieName];
  const authHeader = request.headers.authorization;
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const token = cookieToken ?? headerToken;

  if (!token) {
    reply.code(401).send({
      error: {
        code: 'unauthenticated',
        message: 'Authentication required',
      },
    });
    throw new Error('Unauthenticated');
  }

  try {
    const { userId } = await verifySessionToken(token, jwtSecret);
    return userId;
  } catch {
    reply.code(401).send({
      error: {
        code: 'unauthenticated',
        message: 'Invalid or expired session',
      },
    });
    throw new Error('Invalid session');
  }
}
