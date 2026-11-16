import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { AUTH_COOKIE } from './modules/auth/auth.service.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { authenticate, authenticatePage, blockPendingPasswordChange } from './middlewares/authenticate.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { requireAnyPermission } from './middlewares/authorize.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { eventsService } from './modules/events/events.service.js';
import { blobRouter, filesApiRouter } from './modules/files/files.routes.js';
import { ocrRouter } from './modules/ocr/ocr.routes.js';
import { rolesRouter } from './modules/roles/roles.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { ticketsRouter } from './modules/tickets/tickets.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Funciona tanto em src/ (tsx) quanto em dist/ (compilado)
const PUBLIC = path.resolve(here, '..', 'public');

const fullUrl = (req: { url?: string; originalUrl?: string }) => (req.originalUrl ?? req.url ?? '').split('?')[0];

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: req => req.url === '/health' || req.url === '/api/events' },
      // Log enxuto: nada de cabeçalhos (evita vazar cookie/token de sessão nos logs)
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode })
      },
      customSuccessMessage: (req, res, ms) => `${req.method} ${fullUrl(req)} ${res.statusCode} ${Math.round(ms)}ms`,
      customErrorMessage: (req, res) => `${req.method} ${fullUrl(req)} ${res.statusCode} falhou`,
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info')
    })
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
          scriptSrcAttr: ["'none'"],
          workerSrc: ["'self'", 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
          frameSrc: ["'self'", 'blob:'],
          objectSrc: ["'self'", 'blob:'],
          // Só força HTTPS quando o servidor está atrás de HTTPS (COOKIE_SECURE=true); senão quebraria o acesso por http://IP
          upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null
        }
      },
      crossOriginEmbedderPolicy: false,
      // HSTS só faz sentido atrás de HTTPS
      strictTransportSecurity: env.COOKIE_SECURE
    })
  );
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    prisma
      .$queryRaw`SELECT 1`.then(() => res.json({ ok: true }))
      .catch(() => res.status(503).json({ ok: false }));
  });

  /* ---------- Público ---------- */
  app.get('/login', (_req, res) => res.sendFile(path.join(PUBLIC, 'login.html')));
  app.get('/favicon.ico', (_req, res) => res.status(204).end());
  app.get('/logo.svg', (_req, res) => res.sendFile(path.join(PUBLIC, 'logo.svg')));
  app.get('/favicon.svg', (_req, res) => res.sendFile(path.join(PUBLIC, 'favicon.svg')));
  app.get('/login.js', (_req, res) => res.sendFile(path.join(PUBLIC, 'login.js')));
  app.use('/api/auth', express.json(), authRouter);
  app.get('/logout', (_req, res) => {
    res.clearCookie(AUTH_COOKIE, { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE, path: '/' });
    res.redirect('/login');
  });

  /* ---------- API autenticada ---------- */
  const api = express.Router();
  api.use(authenticate, blockPendingPasswordChange);
  api.get('/events', eventsService.stream);
  api.use('/tickets', ticketsRouter);
  api.use('/config', settingsRouter);
  api.use('/files', filesApiRouter);
  api.use('/ocr', ocrRouter);
  api.use('/usuarios', express.json(), usersRouter);
  api.use('/perfis', express.json(), rolesRouter);
  app.use('/api', api);
  app.use('/_blob', authenticate, blockPendingPasswordChange, blobRouter);

  /* ---------- Páginas autenticadas ---------- */
  // Master (Administrador) e perfis com 'perfis:ver' entram; usuários só aparecem para o master (a API também exige)
  app.get('/administracao', authenticatePage, requireAnyPermission('perfis:ver'), (_req, res) =>
    res.sendFile(path.join(PUBLIC, 'admin.html'))
  );
  app.get('/trocar-senha', authenticatePage, (_req, res) => res.sendFile(path.join(PUBLIC, 'trocar-senha.html')));
  app.get('/trocar-senha.js', authenticatePage, (_req, res) => res.sendFile(path.join(PUBLIC, 'trocar-senha.js')));
  app.use(authenticatePage, express.static(PUBLIC, { index: 'index.html' }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
