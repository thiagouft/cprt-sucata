import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { AUTH_COOKIE, authService } from './auth.service.js';

const loginSchema = z.object({ login: z.string().min(1), senha: z.string().min(1) });
const passwordSchema = z.object({ senhaAtual: z.string().min(1), novaSenha: z.string().min(8, 'A nova senha deve ter ao menos 8 caracteres') });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { code: 'too_many_attempts', message: 'Muitas tentativas. Aguarde alguns minutos.' }
});

const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE, path: '/' } as const;

export const authRouter = Router();

authRouter.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { token, user } = await authService.login(req.body.login, req.body.senha);
    res.cookie(AUTH_COOKIE, token, { ...cookieOptions, maxAge: 1000 * 60 * 60 * 12 });
    res.json({ user });
  })
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, cookieOptions);
  res.json({ ok: true });
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

authRouter.post(
  '/password',
  authenticate,
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    await authService.changePassword(req.user!.id, req.body.senhaAtual, req.body.novaSenha);
    res.json({ ok: true });
  })
);
