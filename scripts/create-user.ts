// Uso: npm run user:create -- <login> <senha> "<Nome completo>" [--perfil "Controlador"]
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { bootstrap } from '../src/shared/bootstrap.js';
import { ADMIN_ROLE_NAME } from '../src/shared/permissions.js';

const args = process.argv.slice(2);
const i = args.indexOf('--perfil');
const perfilNome = i >= 0 ? args.splice(i, 2)[1] : ADMIN_ROLE_NAME;
const [login, senha, nome] = args;

if (!login || !senha || !nome) {
  console.error('Uso: npm run user:create -- <login> <senha> "<Nome completo>" [--perfil "Controlador"]');
  process.exit(1);
}

try {
  await bootstrap();
  const perfil = await prisma.perfil.findUnique({ where: { nome: perfilNome ?? ADMIN_ROLE_NAME } });
  if (!perfil) throw new Error(`Perfil não encontrado: ${perfilNome}`);
  const senhaHash = await hashPassword(senha);
  const u = await prisma.usuario.upsert({
    where: { login: login.toLowerCase() },
    create: { login: login.toLowerCase(), nome, senhaHash, perfilId: perfil.id, deveTrocarSenha: true },
    update: { nome, senhaHash, perfilId: perfil.id, ativo: true, deveTrocarSenha: true },
    select: { id: true, login: true, nome: true, perfil: { select: { nome: true } } }
  });
  console.log('Usuário salvo:', u);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
