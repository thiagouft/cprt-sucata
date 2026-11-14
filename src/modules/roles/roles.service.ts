import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { ADMIN_ROLE_NAME, PERMISSIONS, isPermissionKey } from '../../shared/permissions.js';

const permissionList = z
  .array(z.string())
  .refine(list => list.every(isPermissionKey), 'Permissão desconhecida')
  .transform(list => [...new Set(list)]);

export const createRoleSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(60),
  descricao: z.string().trim().max(200).default(''),
  permissoes: permissionList
});

export const updateRoleSchema = createRoleSchema.partial();

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

type RoleRow = Prisma.PerfilGetPayload<{ include: { permissoes: true; _count: { select: { usuarios: true } } } }>;

const present = (r: RoleRow) => ({
  id: r.id,
  nome: r.nome,
  descricao: r.descricao,
  sistema: r.sistema,
  usuarios: r._count.usuarios,
  permissoes: r.permissoes.map(p => p.permissaoChave).sort()
});

const include = { permissoes: true, _count: { select: { usuarios: true } } } as const;

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

export const rolesService = {
  catalog: () => PERMISSIONS,

  async list() {
    const roles = await prisma.perfil.findMany({ include, orderBy: { nome: 'asc' } });
    return roles.map(present);
  },

  async create(input: CreateRoleInput) {
    try {
      const role = await prisma.perfil.create({
        data: {
          nome: input.nome,
          descricao: input.descricao,
          permissoes: { create: input.permissoes.map(permissaoChave => ({ permissaoChave })) }
        },
        include
      });
      return present(role);
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('Já existe um perfil com este nome.');
      throw e;
    }
  },

  async update(id: string, input: UpdateRoleInput) {
    const current = await prisma.perfil.findUnique({ where: { id } });
    if (!current) throw notFound('Perfil não encontrado.');
    if (current.nome === ADMIN_ROLE_NAME) throw forbidden('O perfil Administrador não pode ser alterado.');
    try {
      const role = await prisma.$transaction(async tx => {
        if (input.permissoes) {
          await tx.perfilPermissao.deleteMany({ where: { perfilId: id } });
          await tx.perfilPermissao.createMany({ data: input.permissoes.map(permissaoChave => ({ perfilId: id, permissaoChave })) });
        }
        return tx.perfil.update({
          where: { id },
          data: { ...(input.nome !== undefined && !current.sistema ? { nome: input.nome } : {}), ...(input.descricao !== undefined ? { descricao: input.descricao } : {}) },
          include
        });
      });
      return present(role);
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('Já existe um perfil com este nome.');
      throw e;
    }
  },

  async remove(id: string) {
    const role = await prisma.perfil.findUnique({ where: { id }, include });
    if (!role) throw notFound('Perfil não encontrado.');
    if (role.sistema) throw forbidden('Perfis do sistema não podem ser excluídos.');
    if (role._count.usuarios > 0) throw conflict('Há usuários neste perfil. Mova-os para outro perfil antes de excluir.');
    await prisma.perfil.delete({ where: { id } });
  }
};
