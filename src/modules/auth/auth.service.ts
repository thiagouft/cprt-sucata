import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AuthUser } from '../../types/express.js';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, unauthorized } from '../../lib/errors.js';
import { isMasterRole, isPermissionKey } from '../../shared/permissions.js';

export const AUTH_COOKIE = 'sucata.token';

const BCRYPT_ROUNDS = 10;
// Hash falso para igualar o tempo de resposta quando o login não existe
const DUMMY_HASH = bcrypt.hashSync('dummy-password', BCRYPT_ROUNDS);

export const hashPassword = (senha: string) => bcrypt.hash(senha, BCRYPT_ROUNDS);

const userInclude = { perfil: { include: { permissoes: true } } } as const;

function toAuthUser(u: {
  id: string;
  login: string;
  nome: string;
  perfilId: string;
  deveTrocarSenha: boolean;
  perfil: { nome: string; permissoes: { permissaoChave: string }[] };
}): AuthUser {
  return {
    id: u.id,
    login: u.login,
    nome: u.nome,
    perfilId: u.perfilId,
    perfil: u.perfil.nome,
    master: isMasterRole(u.perfil.nome),
    deveTrocarSenha: u.deveTrocarSenha,
    permissions: u.perfil.permissoes.map(p => p.permissaoChave).filter(isPermissionKey)
  };
}

export const authService = {
  async login(login: string, senha: string) {
    const user = await prisma.usuario.findUnique({ where: { login: login.trim().toLowerCase() }, include: userInclude });
    const ok = await bcrypt.compare(senha, user?.senhaHash ?? DUMMY_HASH);
    if (!user || !user.ativo || !ok) throw unauthorized('Login ou senha inválidos.', 'invalid_credentials');
    const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
    return { token, user: toAuthUser(user) };
  },

  async userFromToken(token: string): Promise<AuthUser> {
    let sub: string;
    try {
      const payload = jwt.verify(token, env.JWT_SECRET);
      if (typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('payload');
      sub = payload.sub;
    } catch {
      throw unauthorized('Sessão expirada. Faça login novamente.', 'invalid_token');
    }
    const user = await prisma.usuario.findUnique({ where: { id: sub }, include: userInclude });
    if (!user || !user.ativo) throw unauthorized('Usuário inativo.', 'invalid_token');
    return toAuthUser(user);
  },

  async changePassword(userId: string, atual: string, nova: string) {
    const user = await prisma.usuario.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(atual, user.senhaHash))) throw badRequest('Senha atual incorreta.', 'invalid_credentials');
    if (atual === nova) throw badRequest('A nova senha deve ser diferente da atual.', 'same_password');
    await prisma.usuario.update({ where: { id: userId }, data: { senhaHash: await hashPassword(nova), deveTrocarSenha: false } });
  }
};
