/**
 * CLI script to reset a user's password in the local database.
 * Usage:
 *   pnpm --filter @projectpilot/api exec tsx scripts/reset-password.ts <email> <newPassword>
 */

import { eq } from 'drizzle-orm';
import { createDb } from '../src/db/connection.js';
import { loadConfig } from '../src/config.js';
import { users } from '../src/db/schema.js';
import { hashPassword } from '../src/auth.js';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('Usage: tsx scripts/reset-password.ts <email> <newPassword>');
    process.exit(1);
  }

  if (newPassword.length < 8) {
    console.error('Error: Password must be at least 8 characters long.');
    process.exit(1);
  }

  const config = loadConfig();
  const { db, client } = createDb(config.databaseUrl);

  try {
    const existing = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.normalizedEmail, email))
      .limit(1);

    if (existing.length === 0) {
      console.error(`User with email "${email}" not found in database.`);
      process.exit(1);
    }

    const targetUser = existing[0]!;
    const passwordHash = await hashPassword(newPassword);

    await db.update(users).set({ passwordHash }).where(eq(users.id, targetUser.id));

    console.log(
      `Successfully updated password for "${targetUser.displayName}" (${targetUser.email}).`,
    );
    console.log('You can now log in at http://localhost:5173/login with your new password.');
  } catch (err) {
    console.error('Failed to update password:', err);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

main();
