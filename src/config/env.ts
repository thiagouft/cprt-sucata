import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform(v => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter ao menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  COOKIE_SECURE: bool,
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  ADMIN_LOGIN: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default(''),
  ADMIN_NAME: z.string().default('Administrador'),
  ANTHROPIC_API_KEY: z.string().default(''),
  // Modelo rápido e barato para a maioria das fotos
  ANTHROPIC_MODEL: z.string().default('claude-haiku-5-5'),
  // Modelo mais preciso: fotos de visor e reenvio quando o modelo rápido não consegue ler
  ANTHROPIC_MODEL_PRECISE: z.string().default('claude-sonnet-5-5'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(15)
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:\n' + parsed.error.issues.map(i => ` - ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
