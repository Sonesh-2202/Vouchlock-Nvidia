/**
 * Auth routes — register, login, logout, me.
 * Identity from verified session; never trust client-supplied user IDs.
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { registerSchema, loginSchema, resetPasswordSchema } from '@projectpilot/contracts';
import { users } from '../db/schema.js';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  authenticate,
} from '../auth.js';
import { ephemeralSessionStore } from '../ai/ephemeral-store.js';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/connection.js';
import type { Logger } from '../logger.js';

interface AuthRouteOpts {
  config: AppConfig;
  db: Database;
  logger: Logger;
}

export async function authRoutes(app: FastifyInstance, opts: AuthRouteOpts) {
  const { config, db, logger } = opts;

  // POST /api/v1/auth/register
  app.post(
    '/register',
    {
      config: {
        rateLimit: {
          max: config.nodeEnv === 'test' ? 100 : 5,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: 'Invalid input',
            details: parsed.error.flatten(),
          },
        });
      }

      const { email, password, displayName } = parsed.data;
      const normalizedEmail = email.toLowerCase().trim();

      // Check existing user
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.normalizedEmail, normalizedEmail))
        .limit(1);

      if (existing.length > 0) {
        return reply.code(409).send({
          error: {
            code: 'conflict',
            message: 'An account with this email already exists',
          },
        });
      }

      const passwordHash = await hashPassword(password);

      const [user] = await db
        .insert(users)
        .values({
          email,
          normalizedEmail,
          displayName,
          passwordHash,
        })
        .returning({ id: users.id, displayName: users.displayName, email: users.email });

      if (!user) {
        return reply.code(500).send({
          error: { code: 'internal_error', message: 'Failed to create user' },
        });
      }

      const token = await createSessionToken(user.id, config.jwtSecret);

      reply
        .setCookie(config.sessionCookieName, token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.nodeEnv === 'production',
          path: '/',
          maxAge: 7 * 24 * 60 * 60, // 7 days
        })
        .code(201)
        .send({
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
          },
        });

      logger.info({ userId: user.id }, 'user registered');
    },
  );

  // POST /api/v1/auth/login
  app.post(
    '/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: 'Invalid input',
            details: parsed.error.flatten(),
          },
        });
      }

      const { email, password } = parsed.data;
      const normalizedEmail = email.toLowerCase().trim();

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.normalizedEmail, normalizedEmail))
        .limit(1);

      if (!user || !user.passwordHash) {
        return reply.code(401).send({
          error: { code: 'invalid_credentials', message: 'Invalid email or password' },
        });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return reply.code(401).send({
          error: { code: 'invalid_credentials', message: 'Invalid email or password' },
        });
      }

      if (user.deletedAt) {
        return reply.code(401).send({
          error: { code: 'account_deleted', message: 'This account has been deleted' },
        });
      }

      const token = await createSessionToken(user.id, config.jwtSecret);

      reply
        .setCookie(config.sessionCookieName, token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.nodeEnv === 'production',
          path: '/',
          maxAge: 7 * 24 * 60 * 60,
        })
        .send({
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
          },
        });

      logger.info({ userId: user.id }, 'user logged in');
    },
  );

  // POST /api/v1/auth/reset-password
  app.post(
    '/reset-password',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const parsed = resetPasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: 'Invalid password reset input',
            details: parsed.error.flatten(),
          },
        });
      }

      const { email, newPassword, confirmPassword } = parsed.data;
      if (confirmPassword && newPassword !== confirmPassword) {
        return reply.code(400).send({
          error: {
            code: 'password_mismatch',
            message: 'Passwords do not match',
          },
        });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.normalizedEmail, normalizedEmail))
        .limit(1);

      if (!user) {
        return reply.code(404).send({
          error: {
            code: 'user_not_found',
            message: 'No account found with this email address',
          },
        });
      }

      if (user.deletedAt) {
        return reply.code(403).send({
          error: {
            code: 'account_deleted',
            message: 'This account has been deleted',
          },
        });
      }

      const passwordHash = await hashPassword(newPassword);
      await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

      logger.info({ userId: user.id }, 'user password reset successfully');

      const token = await createSessionToken(user.id, config.jwtSecret);

      return reply
        .setCookie(config.sessionCookieName, token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.nodeEnv === 'production',
          path: '/',
          maxAge: 7 * 24 * 60 * 60,
        })
        .code(200)
        .send({
          ok: true,
          message: 'Password reset successfully',
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
          },
        });
    },
  );

  // POST /api/v1/auth/logout
  app.post('/logout', async (request, reply) => {
    // Attempt graceful extraction of userId to clean up ephemeral session store
    const cookieToken = (request.cookies as Record<string, string | undefined>)?.[
      config.sessionCookieName
    ];
    const authHeader = request.headers.authorization;
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = cookieToken ?? headerToken;

    if (token) {
      try {
        const { userId } = await verifySessionToken(token, config.jwtSecret);
        if (userId) {
          ephemeralSessionStore.clearUserSessions(userId);
        }
      } catch {
        // Expired or invalid token — proceed to clear cookie anyway
      }
    }

    return reply
      .clearCookie(config.sessionCookieName, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.nodeEnv === 'production',
      })
      .code(200)
      .send({ ok: true });
  });

  // GET /api/v1/auth/me
  app.get('/me', async (request, reply) => {
    const userId = await authenticate(request, reply, config.jwtSecret, config.sessionCookieName);

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return reply.code(404).send({
        error: { code: 'not_found', message: 'User not found' },
      });
    }

    return { user };
  });
}
