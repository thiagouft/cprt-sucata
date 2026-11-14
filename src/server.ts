import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { eventsService } from './modules/events/events.service.js';
import { bootstrap } from './shared/bootstrap.js';

async function main() {
  await prisma.$connect();
  await bootstrap();
  await eventsService.start();

  const server = createApp().listen(env.PORT, () => logger.info(`Controle de Sucata rodando em http://localhost:${env.PORT}`));

  const shutdown = (signal: string) => {
    logger.info(`${signal} recebido, encerrando...`);
    server.close(async () => {
      await eventsService.stop();
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  logger.error({ err }, 'Falha ao iniciar');
  process.exit(1);
});
