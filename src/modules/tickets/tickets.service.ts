import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { eventsService } from '../events/events.service.js';

export const ticketIdSchema = z.object({ id: z.string().regex(/^[a-z0-9]{4,40}$/i, 'Identificador inválido') });

/** O documento da operação é livre (a tela evolui sem migração); só exigimos o essencial. */
export const ticketBodySchema = z.looseObject({ tipo: z.enum(['suja', 'limpa', 'especial']) });

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
const big = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? BigInt(Math.trunc(v)) : null);

const extractColumns = (t: Record<string, unknown>) => ({
  num: str(t.num),
  tipo: t.tipo as string,
  cliente: str(t.cliente),
  controlador: str(t.controlador),
  criadoEm: big(t.criadoEm),
  atualizadoEm: big(t.atualizadoEm)
});

export const ticketsService = {
  async list() {
    const rows = await prisma.operacao.findMany({ select: { dados: true }, orderBy: { atualizadoEm: { sort: 'desc', nulls: 'last' } } });
    return rows.map(r => r.dados);
  },

  async get(id: string) {
    const row = await prisma.operacao.findUnique({ where: { id }, select: { dados: true } });
    if (!row) throw notFound('Operação não encontrada.');
    return row.dados;
  },

  async save(id: string, body: Record<string, unknown>, userId: string) {
    const dados = { ...body, id } as Prisma.InputJsonObject;
    const cols = extractColumns(dados);
    await prisma.$transaction([
      prisma.operacao.upsert({
        where: { id },
        create: { id, dados, ...cols, criadoPorId: userId },
        update: { dados, ...cols, gravadoEm: new Date() }
      }),
      prisma.auditoria.create({ data: { operacaoId: id, acao: 'gravar', usuarioId: userId, dados } })
    ]);
    await eventsService.publish({ type: 'ticket', id });
  },

  async remove(id: string, userId: string) {
    const row = await prisma.operacao.findUnique({ where: { id } });
    if (row) {
      const fotos = (row.dados as { fotos?: Record<string, { id?: string } | null> } | null)?.fotos ?? {};
      const fileIds = Object.values(fotos)
        .map(f => f?.id)
        .filter((v): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v));
      await prisma.$transaction([
        prisma.operacao.delete({ where: { id } }),
        prisma.auditoria.create({ data: { operacaoId: id, acao: 'excluir', usuarioId: userId, dados: row.dados as Prisma.InputJsonValue } }),
        // Remove os arquivos que pertenciam só a esta operação
        prisma.arquivo.deleteMany({ where: { id: { in: fileIds } } })
      ]);
    }
    await eventsService.publish({ type: 'ticket', id, deleted: true });
  }
};
