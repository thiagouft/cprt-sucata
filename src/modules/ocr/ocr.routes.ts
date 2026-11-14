import { Router } from 'express';
import multer from 'multer';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError, badRequest } from '../../lib/errors.js';
import { requirePermission } from '../../middlewares/authorize.js';
import { KINDS, ocrEnabled, readPhoto, type OcrKind } from './ocr.service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 } });

export const ocrRouter = Router();

ocrRouter.get('/limits', (_req, res) => {
  res.json({ images: ocrEnabled() });
});

ocrRouter.post(
  '/',
  requirePermission('operacoes:gravar'),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!ocrEnabled()) throw new AppError(503, 'sampling_disabled', 'Leitura automática desativada.');
    if (!req.file) throw badRequest('Envie a imagem.', 'no_image');
    const esperado = (req.body as { esperado?: string }).esperado;
    const expected = KINDS.includes(esperado as OcrKind) ? (esperado as OcrKind) : null;
    res.json(await readPhoto(expected, req.file.buffer, req.file.mimetype));
  })
);
