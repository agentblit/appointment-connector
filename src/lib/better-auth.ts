import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";

// Real Pool instance required — better-auth detects the pg adapter via instanceof.
// Placeholder URL is only for `next build` when DATABASE_URL is unset.
// search_path=auth keeps Better Auth tables in the `auth` schema.
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/placeholder",
  options: "-c search_path=auth",
});

export const auth = betterAuth({
  baseURL: process.env.PUBLIC_BASE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  // Avoid colliding with default `better-auth.*` cookies on localhost.
  advanced: {
    cookiePrefix: "appointment-connector",
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await pool.query(
            `UPDATE auth."user" SET "emailVerified" = true WHERE id = $1`,
            [user.id],
          );
        },
      },
    },
  },
  plugins: [nextCookies()],
});
