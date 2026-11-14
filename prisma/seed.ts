import { prisma } from '../src/lib/prisma.js';
import { bootstrap } from '../src/shared/bootstrap.js';

bootstrap()
  .then(() => console.log('Seed concluído: permissões, perfis padrão e administrador.'))
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
