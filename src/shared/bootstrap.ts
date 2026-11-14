import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { ADMIN_ROLE_NAME, DEFAULT_ROLES, PERMISSIONS } from './permissions.js';

/** Sincroniza o catálogo de permissões do código com a tabela `permissoes`. */
export async function syncPermissions() {
  for (const p of PERMISSIONS) {
    await prisma.permissao.upsert({
      where: { chave: p.chave },
      create: { chave: p.chave, menu: p.menu, descricao: p.descricao },
      update: { menu: p.menu, descricao: p.descricao }
    });
  }
  await prisma.permissao.deleteMany({ where: { chave: { notIn: PERMISSIONS.map(p => p.chave) } } });
}

/**
 * Cria os perfis padrão se não existirem. O Administrador é mantido sempre com
 * todas as permissões; os demais só são criados (edições feitas na tela são preservadas).
 */
export async function ensureDefaultRoles() {
  for (const def of DEFAULT_ROLES) {
    const existing = await prisma.perfil.findUnique({ where: { nome: def.nome } });
    if (!existing) {
      await prisma.perfil.create({
        data: {
          nome: def.nome,
          descricao: def.descricao,
          sistema: true,
          permissoes: { create: def.permissoes.map(permissaoChave => ({ permissaoChave })) }
        }
      });
    } else if (def.nome === ADMIN_ROLE_NAME) {
      await prisma.perfilPermissao.createMany({
        data: def.permissoes.map(permissaoChave => ({ perfilId: existing.id, permissaoChave })),
        skipDuplicates: true
      });
    }
  }
}

/** Cria o primeiro administrador a partir do .env, caso não exista nenhum usuário. */
export async function ensureAdminUser() {
  if ((await prisma.usuario.count()) > 0) return;
  if (!env.ADMIN_PASSWORD) {
    logger.warn('Nenhum usuário cadastrado. Defina ADMIN_PASSWORD no .env e rode "npm run db:seed" (ou "npm run user:create").');
    return;
  }
  const perfil = await prisma.perfil.findUniqueOrThrow({ where: { nome: ADMIN_ROLE_NAME } });
  await prisma.usuario.create({
    data: { login: env.ADMIN_LOGIN.toLowerCase(), nome: env.ADMIN_NAME, senhaHash: await hashPassword(env.ADMIN_PASSWORD), perfilId: perfil.id, deveTrocarSenha: true }
  });
  logger.info(`Usuário administrador "${env.ADMIN_LOGIN}" criado.`);
}

export async function bootstrap() {
  await syncPermissions();
  await ensureDefaultRoles();
  await ensureAdminUser();
}
