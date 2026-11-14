import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors.js';
import type { PermissionKey } from '../shared/permissions.js';

/** Exige TODAS as permissões informadas. */
export const requirePermission =
  (...needed: PermissionKey[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    const has = new Set<string>(req.user.permissions);
    if (needed.every(p => has.has(p))) return next();
    next(forbidden());
  };

/** Somente o perfil Administrador (master). */
export const requireMaster = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized());
  if (req.user.master) return next();
  next(forbidden('Somente o administrador pode fazer isso.'));
};

/** Exige ao menos UMA das permissões informadas. */
export const requireAnyPermission =
  (...needed: PermissionKey[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    const has = new Set<string>(req.user.permissions);
    if (needed.some(p => has.has(p))) return next();
    next(forbidden());
  };
