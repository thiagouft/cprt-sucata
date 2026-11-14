import express, { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/prisma.js';
import { requirePermission } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { eventsService } from '../events/events.service.js';
import type { Prisma } from '@prisma/client';

export const settingsRouter = Router();

// A configuração é lida por todos (a tela precisa dela para calcular); só quem tem "ajustes:editar" altera.
settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const row = await prisma.configuracao.findUnique({ where: { chave: 'main' } });
    res.json(row?.dados ?? null);
  })
);

settingsRouter.put(
  '/',
  requirePermission('ajustes:editar'),
  express.json({ limit: '1mb' }),
  validate(z.looseObject({})),
  asyncHandler(async (req, res) => {
    const dados = req.body as Prisma.InputJsonObject;
    await prisma.configuracao.upsert({
      where: { chave: 'main' },
      create: { chave: 'main', dados, atualizadoPor: req.user!.id },
      update: { dados, atualizadoPor: req.user!.id }
    });
    await eventsService.publish({ type: 'config' });
    res.json({ ok: true });
  })
);
