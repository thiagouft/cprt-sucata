import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { requirePermission } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { idParamSchema } from '../users/users.service.js';
import { createRoleSchema, rolesService, updateRoleSchema } from './roles.service.js';

export const rolesRouter = Router();

// O Administrador (que cria usuários e escolhe o perfil) sempre tem 'perfis:ver'
const canReadRoles = requirePermission('perfis:ver');

rolesRouter.get('/permissoes', canReadRoles, (_req, res) => {
  res.json(rolesService.catalog());
});

rolesRouter.get(
  '/',
  canReadRoles,
  asyncHandler(async (_req, res) => {
    res.json(await rolesService.list());
  })
);

rolesRouter.post(
  '/',
  requirePermission('perfis:gerenciar'),
  validate(createRoleSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await rolesService.create(req.body));
  })
);

rolesRouter.patch(
  '/:id',
  requirePermission('perfis:gerenciar'),
  validate(idParamSchema, 'params'),
  validate(updateRoleSchema),
  asyncHandler(async (req, res) => {
    res.json(await rolesService.update(String(req.params.id), req.body));
  })
);

rolesRouter.delete(
  '/:id',
  requirePermission('perfis:gerenciar'),
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    await rolesService.remove(String(req.params.id));
    res.json({ ok: true });
  })
);
