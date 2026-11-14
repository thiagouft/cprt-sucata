import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, buildApp, login, prisma, resetDatabase, roleId } from './support/helpers.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';

const app = buildApp();

async function criarUsuario(loginName: string, perfil: string, senha: string, extra: { deveTrocarSenha?: boolean; ativo?: boolean } = {}) {
  return prisma.usuario.create({
    data: {
      login: loginName,
      nome: `Usuário ${loginName}`,
      senhaHash: await hashPassword(senha),
      perfilId: await roleId(perfil),
      deveTrocarSenha: extra.deveTrocarSenha ?? false,
      ativo: extra.ativo ?? true
    }
  });
}

beforeAll(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('login e sessão', () => {
  it('rejeita requisições sem sessão', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/tickets').expect(401);
  });

  it('o admin inicial entra com a senha do .env e deve trocá-la', async () => {
    const { res } = await login(app, ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.user.master).toBe(true);
    expect(res.body.user.deveTrocarSenha).toBe(true);
    expect(res.headers['set-cookie']?.[0]).toMatch(/sucata\.token=.*HttpOnly/i);
  });

  it('rejeita senha errada e usuário inexistente com a mesma resposta', async () => {
    const a = await request(app).post('/api/auth/login').send({ login: 'admin', senha: 'errada' });
    const b = await request(app).post('/api/auth/login').send({ login: 'naoexiste', senha: 'qualquer' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it('valida o corpo do login', async () => {
    await request(app).post('/api/auth/login').send({ login: 'admin' }).expect(400);
  });

  it('o login não diferencia maiúsculas de minúsculas', async () => {
    await criarUsuario('carlos', 'Consulta', 'senha-do-carlos');
    const { res } = await login(app, { login: 'CARLOS', senha: 'senha-do-carlos' });
    expect(res.status).toBe(200);
  });

  it('usuário desativado não entra', async () => {
    await criarUsuario('inativo', 'Consulta', 'senha-inativo', { ativo: false });
    const { res } = await login(app, { login: 'inativo', senha: 'senha-inativo' });
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(res.status).toBeLessThan(500);
  });

  it('desativar um usuário derruba a sessão que já estava aberta', async () => {
    const u = await criarUsuario('sessao', 'Consulta', 'senha-sessao');
    const { agent } = await login(app, { login: 'sessao', senha: 'senha-sessao' });
    await agent.get('/api/auth/me').expect(200);
    await prisma.usuario.update({ where: { id: u.id }, data: { ativo: false } });
    await agent.get('/api/auth/me').expect(401);
  });

  it('logout limpa o cookie', async () => {
    const { agent } = await login(app, { login: 'carlos', senha: 'senha-do-carlos' });
    const out = await agent.post('/api/auth/logout').expect(200);
    expect(out.headers['set-cookie']?.[0]).toMatch(/sucata\.token=;/);
    await agent.get('/api/auth/me').expect(401);
  });
});

describe('troca de senha obrigatória', () => {
  it('bloqueia a API (403 password_change_required) até trocar a senha', async () => {
    await criarUsuario('novato', 'Controlador', 'inicial123', { deveTrocarSenha: true });
    const { agent } = await login(app, { login: 'novato', senha: 'inicial123' });

    await agent.get('/api/auth/me').expect(200); // permitido para a tela de troca saber quem é
    const blocked = await agent.get('/api/tickets').expect(403);
    expect(blocked.body.code).toBe('password_change_required');
  });

  it('as páginas redirecionam para /trocar-senha enquanto pendente', async () => {
    const { agent } = await login(app, { login: 'novato', senha: 'inicial123' });
    const r = await agent.get('/administracao').redirects(0);
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('/trocar-senha');
    await agent.get('/trocar-senha').expect(200);
  });

  it('rejeita senha atual errada, senha curta e senha repetida', async () => {
    const { agent } = await login(app, { login: 'novato', senha: 'inicial123' });
    const errada = await agent.post('/api/auth/password').send({ senhaAtual: 'x', novaSenha: 'nova-senha-1' });
    expect(errada.status).toBe(400);
    expect(errada.body.code).toBe('invalid_credentials');

    await agent.post('/api/auth/password').send({ senhaAtual: 'inicial123', novaSenha: 'curta' }).expect(400);

    const igual = await agent.post('/api/auth/password').send({ senhaAtual: 'inicial123', novaSenha: 'inicial123' });
    expect(igual.status).toBe(400);
    expect(igual.body.code).toBe('same_password');
  });

  it('após trocar, libera a API e a senha antiga deixa de valer', async () => {
    const { agent } = await login(app, { login: 'novato', senha: 'inicial123' });
    await agent.post('/api/auth/password').send({ senhaAtual: 'inicial123', novaSenha: 'senha-nova-123' }).expect(200);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.deveTrocarSenha).toBe(false);
    await agent.get('/api/tickets').expect(200);

    const antiga = await login(app, { login: 'novato', senha: 'inicial123' });
    expect(antiga.res.status).toBe(401);
    const nova = await login(app, { login: 'novato', senha: 'senha-nova-123' });
    expect(nova.res.status).toBe(200);
  });
});
