import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { buildApp, login, loginAdmin, prisma, resetDatabase, roleId } from './support/helpers.js';

const app: Express = buildApp();
type Agent = Awaited<ReturnType<typeof loginAdmin>>;
let admin: Agent;

beforeAll(async () => {
  await resetDatabase();
  admin = await loginAdmin(app);
});
afterAll(() => prisma.$disconnect());

async function novoUsuario(loginName: string, perfil = 'Consulta', senha = 'senha-inicial-1') {
  return admin.post('/api/usuarios').send({ login: loginName, nome: `Fulano ${loginName}`, senha, perfilId: await roleId(perfil) });
}

describe('gestão de usuários (somente master)', () => {
  it('o master cria usuário, que nasce com troca de senha pendente', async () => {
    const res = await novoUsuario('joao', 'Controlador');
    expect(res.status).toBe(201);
    expect(res.body.login).toBe('joao');
    expect(res.body.deveTrocarSenha).toBe(true);
    expect(res.body).not.toHaveProperty('senhaHash');
  });

  it('o fluxo completo: criar → primeiro login → trocar senha → acessar', async () => {
    await novoUsuario('maria', 'Controlador', 'provisoria-1');
    const { agent, res } = await login(app, { login: 'maria', senha: 'provisoria-1' });
    expect(res.body.user.deveTrocarSenha).toBe(true);
    expect((await agent.get('/api/tickets')).body.code).toBe('password_change_required');
    await agent.post('/api/auth/password').send({ senhaAtual: 'provisoria-1', novaSenha: 'definitiva-1' }).expect(200);
    await agent.get('/api/tickets').expect(200);
  });

  it('normaliza o login e não aceita duplicado', async () => {
    const a = await novoUsuario('  PEDRO ');
    expect(a.status).toBe(201);
    expect(a.body.login).toBe('pedro');
    expect((await novoUsuario('pedro')).status).toBe(409);
  });

  it('valida login, senha e perfil', async () => {
    await novoUsuario('a b').then(r => expect(r.status).toBe(400));
    await novoUsuario('valido1', 'Consulta', 'curta').then(r => expect(r.status).toBe(400));
    const r = await admin.post('/api/usuarios').send({ login: 'valido2', nome: 'Fulano', senha: 'senha-longa-1', perfilId: '00000000-0000-4000-8000-000000000000' });
    expect(r.status).toBe(400);
  });

  it('usuário comum não acessa a gestão de usuários, nem com permissões amplas', async () => {
    await novoUsuario('comum', 'Controlador', 'provisoria-2');
    const { agent } = await login(app, { login: 'comum', senha: 'provisoria-2' });
    await agent.post('/api/auth/password').send({ senhaAtual: 'provisoria-2', novaSenha: 'definitiva-2' }).expect(200);

    await agent.get('/api/usuarios').expect(403);
    await agent.post('/api/usuarios').send({ login: 'intruso', nome: 'Intruso', senha: 'senha-longa-1', perfilId: await roleId('Administrador') }).expect(403);
    const alvo = await prisma.usuario.findUniqueOrThrow({ where: { login: 'joao' } });
    await agent.patch(`/api/usuarios/${alvo.id}`).send({ ativo: false }).expect(403);
    await agent.post(`/api/usuarios/${alvo.id}/redefinir-senha`).expect(403);
  });

  it('o master edita nome, perfil e status', async () => {
    const u = await prisma.usuario.findUniqueOrThrow({ where: { login: 'joao' } });
    const r = await admin.patch(`/api/usuarios/${u.id}`).send({ nome: 'João da Silva', perfilId: await roleId('Consulta'), ativo: false }).expect(200);
    expect(r.body.nome).toBe('João da Silva');
    expect(r.body.ativo).toBe(false);
  });

  it('não permite alterar a senha pelo PATCH (campo ignorado)', async () => {
    const u = await prisma.usuario.findUniqueOrThrow({ where: { login: 'pedro' } });
    await admin.patch(`/api/usuarios/${u.id}`).send({ senha: 'hackeada-123' }).expect(200);
    const { res } = await login(app, { login: 'pedro', senha: 'hackeada-123' });
    expect(res.status).toBe(401);
  });

  it('o master não pode desativar a si mesmo nem remover o último administrador', async () => {
    const eu = await prisma.usuario.findUniqueOrThrow({ where: { login: 'admin' } });
    expect((await admin.patch(`/api/usuarios/${eu.id}`).send({ ativo: false })).status).toBe(409);
    const r = await admin.patch(`/api/usuarios/${eu.id}`).send({ perfilId: await roleId('Consulta') });
    expect(r.status).toBe(409);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: eu.id } })).ativo).toBe(true);
  });

  it('responde 404 para usuário inexistente', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    await admin.patch(`/api/usuarios/${id}`).send({ nome: 'Fulano' }).expect(404);
    await admin.post(`/api/usuarios/${id}/redefinir-senha`).expect(404);
  });
});

describe('redefinição de senha', () => {
  it('gera senha temporária, invalida a antiga e exige nova troca', async () => {
    await novoUsuario('lucia', 'Consulta', 'lucia-antiga-1');
    const u = await prisma.usuario.findUniqueOrThrow({ where: { login: 'lucia' } });
    // Lúcia já tinha trocado a senha antes
    await prisma.usuario.update({ where: { id: u.id }, data: { deveTrocarSenha: false } });

    const r = await admin.post(`/api/usuarios/${u.id}/redefinir-senha`).expect(200);
    expect(r.body.login).toBe('lucia');
    expect(r.body.senhaTemporaria).toHaveLength(10);

    expect((await login(app, { login: 'lucia', senha: 'lucia-antiga-1' })).res.status).toBe(401);
    const { agent, res } = await login(app, { login: 'lucia', senha: r.body.senhaTemporaria });
    expect(res.status).toBe(200);
    expect(res.body.user.deveTrocarSenha).toBe(true);
    expect((await agent.get('/api/tickets')).status).toBe(403);
  });

  it('a senha temporária muda a cada redefinição', async () => {
    const u = await prisma.usuario.findUniqueOrThrow({ where: { login: 'lucia' } });
    const a = await admin.post(`/api/usuarios/${u.id}/redefinir-senha`);
    const b = await admin.post(`/api/usuarios/${u.id}/redefinir-senha`);
    expect(a.body.senhaTemporaria).not.toBe(b.body.senhaTemporaria);
  });
});
