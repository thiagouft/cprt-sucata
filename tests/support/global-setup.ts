import { execSync } from 'node:child_process';
import pg from 'pg';
import { testDatabaseUrl } from './test-db.js';

/** Cria o banco de testes (se preciso) e aplica as migrations antes de toda a suíte. */
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error('Recusando rodar testes em um banco que não termina com _test.');

  const admin = new pg.Client({ connectionString: new URL('/postgres', url).toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url.toString() }
  });
}
