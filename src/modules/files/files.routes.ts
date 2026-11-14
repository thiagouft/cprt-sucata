import express, { Router } from 'express';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { requirePermission } from '../../middlewares/authorize.js';

const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Upload: POST /api/files (corpo binário). */
export const filesApiRouter = Router();

filesApiRouter.post(
  '/',
  requirePermission('operacoes:gravar'),
  express.raw({ type: () => true, limit: `${env.MAX_UPLOAD_MB}mb` }),
  asyncHandler(async (req, res) => {
    const mime = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    if (!ALLOWED.test(mime)) throw badRequest('Envie uma imagem ou PDF.', 'bad_type');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('Arquivo vazio.', 'empty');
    const file = await prisma.arquivo.create({
      data: { mime, tamanho: body.length, conteudo: new Uint8Array(body), enviadoPorId: req.user!.id },
      select: { id: true }
    });
    res.status(201).json({ id: file.id });
  })
);

/** Download: GET /_blob/:id (exige login; o middleware é aplicado no app). */
export const blobRouter = Router();

blobRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) throw notFound();
    const file = await prisma.arquivo.findUnique({ where: { id }, select: { mime: true, conteudo: true } });
    if (!file) throw notFound();
    res.set({ 'Content-Type': file.mime, 'Cache-Control': 'private, max-age=31536000, immutable' });
    res.send(Buffer.from(file.conteudo));
  })
);
