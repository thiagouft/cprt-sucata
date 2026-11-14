import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { hashPassword } from '../auth/auth.service.js';
import { ADMIN_ROLE_NAME } from '../../shared/permissions.js';

const loginField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, 'Login: 3 a 40 caracteres (letras, números, ponto, hífen ou sublinhado)');

export const createUserSchema = z.object({
  login: loginField,
  nome: z.string().trim().min(2, 'Informe o nome').max(120),
  senha: z.string().min(8, 'A senha deve ter ao menos 8 caracteres').max(100),
  perfilId: z.string().uuid('Perfil inválido')
});

export const updateUserSchema = z
  .object({
    nome: z.string().trim().min(2).max(120),
    perfilId: z.string().uuid(),
    ativo: z.boolean()
  })
  .partial();

export const idParamSchema = z.object({ id: z.string().uuid('Identificador inválido') });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

const publicSelect = {
  id: true,
  login: true,
  nome: true,
  ativo: true,
  deveTrocarSenha: true,
  criadoEm: true,
  perfilId: true,
  perfil: { select: { id: true, nome: true } }
} satisfies Prisma.UsuarioSelect;

/** Garante que sempre reste ao menos um administrador ativo. */
async function assertAnotherActiveAdmin(excludingUserId: string) {
  const count = await prisma.usuario.count({
    where: { ativo: true, id: { not: excludingUserId }, perfil: { nome: ADMIN_ROLE_NAME } }
  });
  if (count === 0) throw conflict('Deve existir ao menos um administrador ativo.');
}

// Sem caracteres ambíguos (0/O, 1/l/I) para facilitar o ditado
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export const generateTempPassword = (len = 10) =>
  Array.from({ length: len }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join('');

export const usersService = {
  list() {
    return prisma.usuario.findMany({ select: publicSelect, orderBy: { nome: 'asc' } });
  },

  async create(input: CreateUserInput) {
    const perfil = await prisma.perfil.findUnique({ where: { id: input.perfilId } });
    if (!perfil) throw badRequest('Perfil não encontrado.');
    try {
      return await prisma.usuario.create({
        // O usuário novo define a própria senha no primeiro acesso
        data: {
          login: input.login,
          nome: input.nome,
          perfilId: input.perfilId,
          senhaHash: await hashPassword(input.senha),
          deveTrocarSenha: true
        },
        select: publicSelect
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('Já existe um usuário com este login.');
      throw e;
    }
  },

  async update(id: string, input: UpdateUserInput, actorId: string) {
    const current = await prisma.usuario.findUnique({ where: { id }, include: { perfil: true } });
    if (!current) throw notFound('Usuário não encontrado.');

    if (id === actorId && input.ativo === false) throw conflict('Você não pode desativar o próprio usuário.');

    if (input.perfilId && input.perfilId !== current.perfilId) {
      const novo = await prisma.perfil.findUnique({ where: { id: input.perfilId } });
      if (!novo) throw badRequest('Perfil não encontrado.');
    }

    const leavingAdmin =
      current.perfil.nome === ADMIN_ROLE_NAME && current.ativo && (input.ativo === false || (input.perfilId && input.perfilId !== current.perfilId));
    if (leavingAdmin) await assertAnotherActiveAdmin(id);

    return prisma.usuario.update({ where: { id }, data: input, select: publicSelect });
  },

  /** Gera uma senha temporária (mostrada uma única vez ao master) e exige a troca no próximo login. */
  async resetPassword(id: string) {
    const user = await prisma.usuario.findUnique({ where: { id } });
    if (!user) throw notFound('Usuário não encontrado.');
    const senhaTemporaria = generateTempPassword();
    await prisma.usuario.update({ where: { id }, data: { senhaHash: await hashPassword(senhaTemporaria), deveTrocarSenha: true } });
    return { login: user.login, senhaTemporaria };
  }
};
