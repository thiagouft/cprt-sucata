import type { PermissionKey } from '../shared/permissions.js';

export interface AuthUser {
  id: string;
  login: string;
  nome: string;
  perfilId: string;
  perfil: string;
  permissions: PermissionKey[];
  /** Perfil Administrador: único que gerencia usuários */
  master: boolean;
  /** Precisa trocar a senha antes de usar o sistema */
  deveTrocarSenha: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
