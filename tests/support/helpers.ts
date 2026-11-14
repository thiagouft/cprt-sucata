import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { bootstrap } from '../../src/shared/bootstrap.js';

export { prisma };

export const ADMIN = { login: 'admin', senha: 'admin-inicial' };

/** Zera os dados e recria permissões, perfis padrão e o admin (com troca de senha pendente). */
export async function resetDatabase() {
  await prisma.auditoria.deleteMany();
  await prisma.operacao.deleteMany();
  await prisma.arquivo.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.perfilPermissao.deleteMany();
  await prisma.perfil.deleteMany();
  await prisma.permissao.deleteMany();
  await bootstrap();
}

export function buildApp(): Express {
  return createApp();
}

/** Faz login e devolve um agente com o cookie de sessão. */
export async function login(app: Express, credenciais: { login: string; senha: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send(credenciais);
  return { agent, res };
}

/** Admin com a troca de senha obrigatória já resolvida (equivale a um admin "em uso"). */
export async function loginAdmin(app: Express) {
  await prisma.usuario.update({ where: { login: ADMIN.login }, data: { deveTrocarSenha: false } });
  const { agent } = await login(app, ADMIN);
  return agent;
}

export async function roleId(nome: string) {
  return (await prisma.perfil.findUniqueOrThrow({ where: { nome } })).id;
}
