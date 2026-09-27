import { randomUUID } from "crypto";
import { isDatabaseConfigured, query } from "./db";

/**
 * GitHub OAuth can be attached here without changing the gameplay routes. For
 * the first deploy and local preview, ChessTutor uses one clearly named demo
 * player and still keeps every row scoped by user_id.
 */
export async function getCurrentUserId() {
  if (!isDatabaseConfigured()) return "demo-user";

  const githubUsername = process.env.DEMO_GITHUB_USERNAME || "demo-player";
  const existing = await query<{ id: string }>(
    "SELECT id FROM users WHERE github_username = $1 LIMIT 1",
    [githubUsername],
  );
  if (existing[0]?.id) return existing[0].id;

  const inserted = await query<{ id: string }>(
    "INSERT INTO users (github_username, email) VALUES ($1, $2) ON CONFLICT (github_username) DO UPDATE SET github_username = EXCLUDED.github_username RETURNING id",
    [githubUsername, `${githubUsername}@users.noreply.github.com`],
  );
  return inserted[0]?.id || randomUUID();
}
