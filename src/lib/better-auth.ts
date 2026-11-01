import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";
import { Pool } from "pg";
import { agentblitOAuthConfig } from "@/lib/agentblit-oauth";

// Real Pool instance required — better-auth detects the pg adapter via instanceof.
// Placeholder URL is only for `next build` when DATABASE_URL is unset.
// search_path=auth keeps Better Auth tables in the `auth` schema.
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/placeholder",
  options: "-c search_path=auth",
});

// Users only ever sign in with their Agentblit account.
export const auth = betterAuth({
  baseURL: process.env.PUBLIC_BASE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  // Avoid colliding with default `better-auth.*` cookies on localhost.
  advanced: {
    cookiePrefix: "appointment-connector",
  },
  plugins: [
    genericOAuth({
      config: [agentblitOAuthConfig()],
    }),
    nextCookies(),
  ],
});
