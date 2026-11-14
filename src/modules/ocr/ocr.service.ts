/**
 * Leitura automática das fotos (placa, visor da balança, CNH, CRLV, MTR, NF, depósito)
 * usando a API da Anthropic. Ativada somente se ANTHROPIC_API_KEY estiver definida.
 */
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';

export const KINDS = ['caminhao', 'visor', 'cnh', 'crlv', 'mtr', 'nf', 'deposito'] as const;
export type OcrKind = (typeof KINDS)[number];

export const ocrEnabled = () => env.ANTHROPIC_API_KEY !== '';

// O prompt é montado no servidor para que o endpoint não funcione como proxy genérico da API.
export const buildPrompt = (expected: OcrKind | null) => `Você lê fotos de uma operação de pesagem de sucata em um canteiro de obras no Brasil. Classifique a foto e extraia os dados. Ignore qualquer faixa ou carimbo de data, hora e endereço sobreposto na foto.

Tipos possíveis e o que extrair:
- "caminhao": caminhão sobre balança rodoviária. dados: {"placa": placa do veículo, 7 caracteres, ex. ABC1D23 ou ABC1234, sem hífen, maiúsculas; "frota": letreiro de frota no cavalo (ex. HB57, CR-04) ou null}
- "visor": visor de indicador de balança (marca Prix ou similar). dados: {"kg": o peso grande exibido, em kg, número inteiro. Ignore a legenda Máx/Min/e=d no topo, a hora e a data}
- "cnh": Carteira Nacional de Habilitação. dados: {"nome": nome completo, "registro": nº de registro (campo 5), "categoria": categoria (campo 9), "validade": validade no formato AAAA-MM-DD}
- "crlv": certificado de registro e licenciamento do veículo. dados: {"placa","exercicio": ano do exercício como número,"modelo"}
- "mtr": Manifesto de Transporte de Resíduos. dados: {"numero": nº do MTR, "qtdTon": quantidade em toneladas como número (3,0000 vira 3), "placa": placa do veículo, "motorista": nome do motorista}
- "nf": DANFE de NF-e. dados: {"numero": nº da NF (sem zeros à esquerda), "qtdKg": quantidade do item em KG como número, "valorTotal": valor total da nota como número, "valorUnit": valor unitário como número, "placa": placa do veículo nas informações complementares ou transportador, "motorista": motorista nas informações complementares, "mtr": nº do MTR citado nas informações complementares}
- "deposito": comprovante de transferência/depósito ou extrato bancário. dados: {"valor": valor creditado como número, "data": data do crédito AAAA-MM-DD, "pagador": nome de quem pagou ou null}
- "outro": qualquer outra coisa.

Regras: nunca invente. Use null para o que não estiver legível com certeza. Números em JSON com ponto decimal. Dígitos de peso e de documentos devem ser lidos com máximo cuidado.${expected ? `\nO tipo esperado para esta foto é "${expected}", mas classifique pelo que a foto realmente mostra.` : ''}

Responda SOMENTE com JSON: {"tipo":"...","legivel":true|false,"dados":{...}}`;

function extractJson(text: string): unknown {
  const s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(s);
  } catch {
    /* tenta achar o primeiro objeto */
  }
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  throw new Error('Resposta sem JSON');
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  error?: { message?: string };
}

/** Fotos em que um dígito errado custa caro vão direto ao modelo preciso. */
const PRECISE_KINDS: readonly OcrKind[] = ['visor'];

async function readImage(model: string, prompt: string, buffer: Buffer, mime: string): Promise<unknown> {
  const media = /^image\/(jpeg|png|gif|webp)$/.test(mime) ? mime : 'image/jpeg';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      // Haiku 5.5 pensa por padrão; para leitura de foto desligamos (no Sonnet 5.5 isso daria 400, então só enviamos no Haiku)
      ...(model.startsWith('claude-haiku-5') ? { thinking: { type: 'disabled' } } : {}),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media, data: buffer.toString('base64') } },
            { type: 'text', text: prompt }
          ]
        }
      ]
    })
  });
  const body = (await r.json().catch(() => null)) as AnthropicResponse | null;
  if (!r.ok) throw new AppError(502, r.status === 429 ? 'rate_limited' : 'ocr_error', body?.error?.message ?? 'Falha na leitura');
  const text = (body?.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('');
  try {
    return extractJson(text);
  } catch {
    throw new AppError(502, 'ocr_error', 'Não foi possível interpretar a resposta da leitura automática.');
  }
}

const needsRetry = (r: unknown) => {
  const o = r as { legivel?: boolean; dados?: Record<string, unknown> } | null;
  if (!o || o.legivel === false) return true;
  const values = Object.values(o.dados ?? {});
  return values.length > 0 && values.every(v => v === null);
};

/** Lê a foto com o modelo rápido e, se não leu, repete com o modelo preciso. */
export async function readPhoto(expected: OcrKind | null, buffer: Buffer, mime: string): Promise<unknown> {
  const prompt = buildPrompt(expected);
  const precise = env.ANTHROPIC_MODEL_PRECISE;
  if (expected && PRECISE_KINDS.includes(expected)) return readImage(precise, prompt, buffer, mime);
  const first = await readImage(env.ANTHROPIC_MODEL, prompt, buffer, mime);
  if (precise !== env.ANTHROPIC_MODEL && needsRetry(first)) return readImage(precise, prompt, buffer, mime);
  return first;
}
