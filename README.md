# Controle de Sucata — Node.js · TypeScript · Prisma · PostgreSQL

Pesagem no pátio, MTR e NF-e (inicial/complementar), pesagem pós-limpeza, recebimento do depósito,
alertas, histórico, painel e exportação CSV — agora com **login, usuários, perfis e permissões por menu**.

## Stack

- **Node 20+ / Express 4 / TypeScript** (ESM, `strict`)
- **Prisma 6** (ORM + migrations) sobre **PostgreSQL**
- **Zod** (validação de env e de requisições), **JWT em cookie httpOnly** + **bcrypt**
- **helmet**, **express-rate-limit** (login), **pino** (logs), **Vitest** (testes)

## Estrutura

```
prisma/
  schema.prisma         Modelos (Usuario, Perfil, Permissao, Operacao, Arquivo, ...)
  migrations/           Migrações versionadas (inclui a view vw_operacoes)
  seed.ts               Permissões, perfis padrão e administrador
src/
  server.ts / app.ts    Bootstrap e montagem do Express
  config/env.ts         Variáveis de ambiente validadas com Zod
  lib/                  prisma, logger, erros, asyncHandler
  middlewares/          authenticate, authorize (RBAC), validate, error-handler
  shared/               permissions.ts (catálogo) e bootstrap.ts
  modules/              auth · users · roles · tickets · settings · files · ocr · events
public/                 index.html (app), login.html, admin.html (usuários e perfis)
scripts/create-user.ts  Criação de usuário pela linha de comando
tests/                  Testes
```

Cada módulo segue `routes → service (regras de negócio) → Prisma`, com validação Zod na borda.

## Rodando localmente

Requisitos: Node 20+ e um PostgreSQL acessível (o `.env` aponta para
`postgres://postgres:postgres@localhost:5432/cprt_sucata`).

```bash
npm install
cp .env.example .env     # ajuste DATABASE_URL, JWT_SECRET e ADMIN_PASSWORD
npm run db:migrate       # cria o banco cprt_sucata (se preciso) e aplica as migrações
npm run dev              # http://localhost:3000
```

No primeiro start o servidor sincroniza as permissões, cria os perfis padrão e o administrador
(`ADMIN_LOGIN` / `ADMIN_PASSWORD`, só se ainda não houver usuários). `npm run db:seed` faz o mesmo manualmente.

Produção: `npm run build && npm run db:deploy && npm start`.

## Acesso e permissões (RBAC)

- **Login** em `/login`. O JWT vai em cookie `httpOnly`; usuário e permissões são relidos do banco a cada
  requisição, então desativar um usuário ou trocar seu perfil vale imediatamente.
- **Master (Administrador)**: só o perfil Administrador cria usuários, edita, ativa/desativa e **redefine senhas**
  (isso não é uma permissão que outros perfis possam receber). Os demais perfis continuam existindo e são
  editáveis, mas sem acesso à gestão de usuários.
- **Senha**: todo usuário novo, e todo usuário que teve a senha redefinida, é obrigado a trocá-la no
  primeiro login (`/trocar-senha`); a API fica bloqueada até a troca. O master cria o usuário com uma senha
  inicial ou usa "Redefinir senha", que gera uma senha temporária mostrada uma única vez. Qualquer usuário
  pode trocar a própria senha em Ajustes → Alterar senha.
- **Usuários e Perfis**: botão de pessoas no topo do app (`/administracao`). A aba Usuários é só do master;
  a aba Perfis aparece para quem tem `perfis:ver`.
- A API aplica as permissões (`requirePermission` / `requireMaster`); a tela apenas esconde o que não está liberado.

| Permissão | Libera |
|---|---|
| `registrar:ver`, `pendencias:ver`, `alertas:ver`, `historico:ver`, `painel:ver` | Cada aba do app |
| `operacoes:gravar` / `operacoes:excluir` | Criar/alterar (inclui fotos e leitura por IA) / excluir operações |
| `ajustes:ver` / `ajustes:editar` | Abrir Ajustes / alterar sucateiros, preços e textos |
| `perfis:ver` / `perfis:gerenciar` | Listar / criar, editar, excluir perfis |

Perfis padrão: **Administrador** (todas, fixo), **Controlador** e **Consulta** (editáveis).
Regras de segurança: não é possível desativar a si mesmo nem deixar o sistema sem administrador ativo.
Para adicionar uma permissão nova, inclua-a em `src/shared/permissions.ts` (sincroniza no próximo start).

## Comandos

| Comando | Função |
|---|---|
| `npm run dev` | Servidor com recarga (tsx) |
| `npm run build` / `npm start` | Compila para `dist/` e executa |
| `npm run typecheck` / `npm test` | Checagem de tipos / testes |
| `npm run db:migrate` | Nova migração em desenvolvimento |
| `npm run db:deploy` | Aplica migrações (produção) |
| `npm run db:studio` | Prisma Studio |
| `npm run user:create -- joao Senha1234 "João" --perfil Controlador` | Cria/atualiza usuário |

## Banco de dados

Relatórios em SQL: `SELECT * FROM vw_operacoes ORDER BY aberta_em DESC;`

| Tabela | Conteúdo |
|---|---|
| `usuarios`, `perfis`, `permissoes`, `perfis_permissoes` | Acesso e RBAC |
| `operacoes` | Operação completa em `dados` (jsonb) + colunas para filtro (`num`, `tipo`, `cliente`, ...) |
| `arquivos` | Fotos e PDFs (bytea), servidos em `/_blob/<id>` |
| `configuracao` | Ajustes globais |
| `auditoria` | Cada gravação/exclusão de operação, com usuário |

## Leitura automática das fotos

Defina `ANTHROPIC_API_KEY` no `.env`. A maioria das fotos usa `ANTHROPIC_MODEL` (Haiku 5.5, rápido e barato); a foto do visor da balança e qualquer foto que o Haiku não consiga ler usam `ANTHROPIC_MODEL_PRECISE` (Sonnet 5.5). Sem a chave o app funciona
normalmente, com os dados digitados à mão.

## Produção

Coloque atrás de HTTPS, use `COOKIE_SECURE=true`, um `JWT_SECRET` longo e aleatório e troque a senha do administrador.
