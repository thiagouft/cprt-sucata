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

/** Cria um usuário já com a senha trocada e devolve a sessão dele. */
async function sessao(loginName: string, perfil: string): Promise<Agent> {
  await admin.post('/api/usuarios').send({ login: loginName, nome: `Fulano ${loginName}`, senha: 'provisoria-1', perfilId: await roleId(perfil) }).expect(201);
  const { agent } = await login(app, { login: loginName, senha: 'provisoria-1' });
  await agent.post('/api/auth/password').send({ senhaAtual: 'provisoria-1', novaSenha: 'definitiva-1' }).expect(200);
  return agent;
}

const operacao = (extra: object = {}) => ({ tipo: 'suja', num: '001', cliente: 'ACME', controlador: 'Fulano', criadoEm: 1700000000000, atualizadoEm: 1700000000000, ...extra });

describe('perfis e permissões por menu', () => {
  it('lista o catálogo e os perfis padrão para quem tem perfis:ver', async () => {
    const perfis = await admin.get('/api/perfis').expect(200);
    expect(perfis.body.map((p: { nome: string }) => p.nome).sort()).toEqual(['Administrador', 'Consulta', 'Controlador']);
    const catalogo = await admin.get('/api/perfis/permissoes').expect(200);
    expect(catalogo.body.length).toBeGreaterThan(5);
  });

  it('cria perfil, valida permissões desconhecidas e impede nome duplicado', async () => {
    const ok = await admin.post('/api/perfis').send({ nome: 'Balança', descricao: 'Só registra', permissoes: ['registrar:ver', 'operacoes:gravar'] });
    expect(ok.status).toBe(201);
    expect(ok.body.permissoes.sort()).toEqual(['operacoes:gravar', 'registrar:ver']);

    expect((await admin.post('/api/perfis').send({ nome: 'Falso', permissoes: ['foo:bar'] })).status).toBe(400);
    expect((await admin.post('/api/perfis').send({ nome: 'Balança', permissoes: [] })).status).toBe(409);
  });

  it('o perfil Administrador não pode ser editado nem excluído', async () => {
    const id = await roleId('Administrador');
    expect((await admin.patch(`/api/perfis/${id}`).send({ permissoes: ['registrar:ver'] })).status).toBeGreaterThanOrEqual(400);
    expect((await admin.delete(`/api/perfis/${id}`)).status).toBeGreaterThanOrEqual(400);
    const perm = await prisma.perfilPermissao.count({ where: { perfilId: id } });
    expect(perm).toBeGreaterThan(5);
  });

  it('perfil em uso não pode ser excluído; sem uso, pode', async () => {
    const livre = await admin.post('/api/perfis').send({ nome: 'Temporário', permissoes: [] }).expect(201);
    await admin.delete(`/api/perfis/${livre.body.id}`).expect(200);
    expect(await prisma.perfil.count({ where: { nome: 'Temporário' } })).toBe(0);

    const emUso = await roleId('Consulta');
    await sessao('usa-consulta', 'Consulta');
    expect((await admin.delete(`/api/perfis/${emUso}`)).status).toBeGreaterThanOrEqual(400);
    expect(await prisma.perfil.count({ where: { id: emUso } })).toBe(1);
  });
});

describe('permissões aplicadas à API de operações', () => {
  it('Consulta lê mas não grava nem exclui', async () => {
    const consulta = await sessao('so-le', 'Consulta');
    await consulta.get('/api/tickets').expect(200);
    await consulta.put('/api/tickets/abc1234').send(operacao()).expect(403);
    await consulta.delete('/api/tickets/abc1234').expect(403);
  });

  it('Controlador grava e lê, mas não exclui', async () => {
    const ctrl = await sessao('controla', 'Controlador');
    await ctrl.put('/api/tickets/op0001').send(operacao()).expect(200);
    const lista = await ctrl.get('/api/tickets').expect(200);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0]).toMatchObject({ id: 'op0001', cliente: 'ACME' });
    await ctrl.delete('/api/tickets/op0001').expect(403);
    expect(await prisma.operacao.count({ where: { id: 'op0001' } })).toBe(1);
  });

  it('Administrador exclui e a exclusão é auditada', async () => {
    await admin.delete('/api/tickets/op0001').expect(200);
    expect(await prisma.operacao.count({ where: { id: 'op0001' } })).toBe(0);
    const acoes = await prisma.auditoria.findMany({ where: { operacaoId: 'op0001' }, orderBy: { em: 'asc' } });
    expect(acoes.map(a => a.acao)).toEqual(['gravar', 'excluir']);
  });

  it('valida identificador e corpo da operação', async () => {
    await admin.put('/api/tickets/x').send(operacao()).expect(400);
    await admin.put('/api/tickets/valido1').send({ tipo: 'invalido' }).expect(400);
  });

  it('regravar a mesma operação atualiza em vez de duplicar', async () => {
    await admin.put('/api/tickets/op0002').send(operacao({ cliente: 'Primeiro' })).expect(200);
    await admin.put('/api/tickets/op0002').send(operacao({ cliente: 'Segundo' })).expect(200);
    expect(await prisma.operacao.count({ where: { id: 'op0002' } })).toBe(1);
    expect((await prisma.operacao.findUniqueOrThrow({ where: { id: 'op0002' } })).cliente).toBe('Segundo');
  });

  it('alterar as permissões de um perfil vale na próxima requisição', async () => {
    const perfil = await admin.post('/api/perfis').send({ nome: 'Dinâmico', permissoes: ['ajustes:ver'] }).expect(201);
    const user = await sessao('dinamico', 'Dinâmico');
    await user.get('/api/tickets').expect(403); // 'ajustes:ver' não libera a leitura de operações
    const me = await user.get('/api/auth/me').expect(200);
    expect(me.body.permissions).toEqual(['ajustes:ver']);

    await admin.patch(`/api/perfis/${perfil.body.id}`).send({ permissoes: ['ajustes:ver', 'historico:ver'] }).expect(200);
    await user.get('/api/tickets').expect(200); // vale já na próxima requisição, sem novo login
  });

  it('quem só tem perfis:ver enxerga perfis, mas não gerencia', async () => {
    await admin.post('/api/perfis').send({ nome: 'Auditor', permissoes: ['perfis:ver'] }).expect(201);
    const auditor = await sessao('auditor', 'Auditor');
    await auditor.get('/api/perfis').expect(200);
    await auditor.post('/api/perfis').send({ nome: 'Outro', permissoes: [] }).expect(403);
    await auditor.get('/api/usuarios').expect(403);
  });
});
