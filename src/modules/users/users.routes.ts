import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireMaster } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { createUserSchema, idParamSchema, updateUserSchema, usersService } from './users.service.js';

/** Gestão de usuários: exclusiva do administrador (master). */
export const usersRouter = Router();
usersRouter.use(requireMaster);

usersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await usersService.list());
  })
);

usersRouter.post(
  '/',
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await usersService.create(req.body));
  })
);

usersRouter.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    res.json(await usersService.update(String(req.params.id), req.body, req.user!.id));
  })
);

usersRouter.post(
  '/:id/redefinir-senha',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await usersService.resetPassword(String(req.params.id)));
  })
);
