/**
 * Tempo real: alterações são publicadas com NOTIFY no PostgreSQL e repassadas aos
 * navegadores por Server-Sent Events. Funciona com várias instâncias do servidor.
 */
import type { Request, Response } from 'express';
import pg from 'pg';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';

const CHANNEL = 'sucata_eventos';

export type AppEvent = { type: 'ticket'; id: string; deleted?: boolean; data?: unknown } | { type: 'config'; data?: unknown };

const clients = new Set<Response>();
let listener: pg.Client | null = null;
let stopped = false;

function broadcast(msg: AppEvent) {
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) res.write(line);
}

async function enrich(msg: AppEvent): Promise<AppEvent | null> {
  // O payload do NOTIFY tem limite de 8 kB: enviamos só a chave e buscamos o documento.
  if (msg.type === 'ticket' && !msg.deleted) {
    const row = await prisma.operacao.findUnique({ where: { id: msg.id }, select: { dados: true } });
    return row ? { ...msg, data: row.dados } : null;
  }
  if (msg.type === 'config') {
    const row = await prisma.configuracao.findUnique({ where: { chave: 'main' }, select: { dados: true } });
    return { ...msg, data: row?.dados ?? null };
  }
  return msg;
}

async function connect() {
  if (stopped) return;
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  const retry = () => {
    client.removeAllListeners();
    client.end().catch(() => undefined);
    if (listener === client) listener = null;
    if (!stopped) setTimeout(connect, 3000).unref();
  };
  client.on('error', err => {
    logger.error({ err }, 'conexão LISTEN caiu');
    retry();
  });
  client.on('notification', n => {
    void (async () => {
      try {
        const msg = JSON.parse(n.payload ?? '') as AppEvent;
        const full = await enrich(msg);
        if (full) broadcast(full);
      } catch (err) {
        logger.warn({ err }, 'falha ao processar notificação');
      }
    })();
  });
  try {
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    listener = client;
  } catch (err) {
    logger.error({ err }, 'falha ao escutar eventos');
    retry();
  }
}

export const eventsService = {
  start: connect,

  async stop() {
    stopped = true;
    await listener?.end().catch(() => undefined);
  },

  async publish(msg: AppEvent) {
    await prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${JSON.stringify(msg)})`;
  },

  /** Handler do endpoint SSE. */
  stream(req: Request, res: Response) {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
  }
};
