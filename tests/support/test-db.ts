import 'dotenv/config';

/** Banco exclusivo dos testes: nunca toca no banco de desenvolvimento. */
export function testDatabaseUrl(): string {
  const base = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cprt_sucata';
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '') || 'cprt_sucata';
  url.pathname = '/' + (name.endsWith('_test') ? name : name + '_test');
  return url.toString();
}
