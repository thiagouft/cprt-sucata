import express, { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAnyPermission, requirePermission } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { ticketBodySchema, ticketIdSchema, ticketsService } from './tickets.service.js';

export const ticketsRouter = Router();

const canView = requireAnyPermission('registrar:ver', 'pendencias:ver', 'alertas:ver', 'historico:ver', 'painel:ver', 'operacoes:gravar');

ticketsRouter.get(
  '/',
  canView,
  asyncHandler(async (_req, res) => {
    res.json(await ticketsService.list());
  })
);

ticketsRouter.get(
  '/:id',
  canView,
  validate(ticketIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await ticketsService.get(String(req.params.id)));
  })
);

ticketsRouter.put(
  '/:id',
  requirePermission('operacoes:gravar'),
  express.json({ limit: '2mb' }),
  validate(ticketIdSchema, 'params'),
  validate(ticketBodySchema),
  asyncHandler(async (req, res) => {
    await ticketsService.save(String(req.params.id), req.body, req.user!.id);
    res.json({ ok: true });
  })
);

ticketsRouter.delete(
  '/:id',
  requirePermission('operacoes:excluir'),
  validate(ticketIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    await ticketsService.remove(String(req.params.id), req.user!.id);
    res.json({ ok: true });
  })
);
