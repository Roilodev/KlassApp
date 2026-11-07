import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definido. Configure o arquivo .env na raiz do projeto.');
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const migrationFiles = (await readdir(migrationDirectory))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const migrationFile of migrationFiles) {
      const migrationName = migrationFile.slice(0, -4);
      const alreadyApplied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [migrationName],
      );
      if (alreadyApplied.rowCount > 0) {
        console.log(`Migration already applied: ${migrationName}`);
        continue;
      }

      const migrationPath = join(migrationDirectory, migrationFile);
      const migration = await readFile(migrationPath, 'utf8');
      await client.query(migration);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migrationName]);
      console.log(`Applied migration: ${migrationName}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
