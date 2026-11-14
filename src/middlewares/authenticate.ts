import type { NextFunction, Request, Response } from 'express';
import { AUTH_COOKIE, authService } from '../modules/auth/auth.service.js';
import { AppError, unauthorized } from '../lib/errors.js';

/**
 * Exige um JWT válido no cookie. O usuário e suas permissões são recarregados do
 * banco a cada requisição: desativar um usuário ou mudar seu perfil vale na hora.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[AUTH_COOKIE] as string | undefined;
    if (!token) throw unauthorized();
    req.user = await authService.userFromToken(token);
    next();
  } catch (e) {
    next(e);
  }
}

/** Bloqueia a API enquanto o usuário não trocar a senha obrigatória. */
export function blockPendingPasswordChange(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.deveTrocarSenha) {
    return next(new AppError(403, 'password_change_required', 'Troque a sua senha para continuar.'));
  }
  next();
}

// Páginas liberadas enquanto a troca de senha está pendente
const ALLOWED_WHILE_PENDING = new Set(['/trocar-senha', '/trocar-senha.js', '/logout', '/favicon.ico']);

/** Para páginas HTML: redireciona ao login (ou à troca de senha) em vez de devolver JSON. */
export async function authenticatePage(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[AUTH_COOKIE] as string | undefined;
    if (!token) return res.redirect('/login');
    req.user = await authService.userFromToken(token);
    if (req.user.deveTrocarSenha && !ALLOWED_WHILE_PENDING.has(req.path)) return res.redirect('/trocar-senha');
    next();
  } catch {
    res.redirect('/login');
  }
}
