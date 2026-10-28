/**
 * Runner de migraciones.
 * Aplica, en orden, cada archivo .sql de ./migrations que aún no esté registrado.
 * Es idempotente: ejecutar de nuevo no vuelve a aplicar las ya hechas.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, withTransaction } from './pool.ts';
import { seed } from './seed.ts';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM _migrations');
  return new Set(rows.map((r) => r.name));
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const done = await appliedMigrations();
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`Aplicando migración ${file}...`);
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    });
  }
  // eslint-disable-next-line no-console
  console.log('Migraciones al día.');
}

// Ejecutable directo: `npm run migrate`.
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => seed())
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Fallo en migración:', err);
      process.exit(1);
    });
}
