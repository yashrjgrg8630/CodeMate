import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

export const DEFAULT_TEST_DATABASE_URL = "postgresql://codemate:codemate@localhost:5432/codemate_test";

/** Creates the test database if needed, then rebuilds the schema from checked-in migrations. */
export default async function setup(): Promise<void> {
  const raw = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const url = new URL(raw);
  const dbName = decodeURIComponent(url.pathname.slice(1));

  const admin = new pg.Client({ connectionString: raw.replace(`/${dbName}`, "/postgres") });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `Cannot reach Postgres for tests (${err instanceof Error ? err.message : String(err)}). Start it with \`npm run db:up\`.`,
    );
  }
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, "")}"`);
  await admin.end();

  const client = new pg.Client({ connectionString: raw });
  await client.connect();
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const migrationsDir = join(process.cwd(), "prisma/migrations");
  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const migration of migrations) {
    const sql = readFileSync(join(migrationsDir, migration.name, "migration.sql"), "utf8");
    await client.query(sql);
  }
  await client.end();
}
