import { neon } from "@neondatabase/serverless";

export type DbRow = Record<string, unknown>;

const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl
  ? neon(databaseUrl, { fetchOptions: { cache: "no-store" } })
  : null;

export function isDatabaseConfigured() {
  return Boolean(sql);
}

/**
 * Keep all SQL behind one small adapter. The app remains previewable without
 * Neon, while production uses parameterized Neon queries exclusively.
 */
export async function query<T extends DbRow = DbRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!sql) return [];
  return (await sql(text, params)) as T[];
}
