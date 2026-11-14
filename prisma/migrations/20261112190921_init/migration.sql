-- CreateEnum
CREATE TYPE "AcaoAuditoria" AS ENUM ('gravar', 'excluir');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "login" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "perfil_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfis" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissoes" (
    "chave" TEXT NOT NULL,
    "menu" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "permissoes_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "perfis_permissoes" (
    "perfil_id" UUID NOT NULL,
    "permissao_chave" TEXT NOT NULL,

    CONSTRAINT "perfis_permissoes_pkey" PRIMARY KEY ("perfil_id","permissao_chave")
);

-- CreateTable
CREATE TABLE "operacoes" (
    "id" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "num" TEXT,
    "tipo" TEXT NOT NULL,
    "cliente" TEXT,
    "controlador" TEXT,
    "criado_em" BIGINT,
    "atualizado_em" BIGINT,
    "criado_por" UUID,
    "gravado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivos" (
    "id" UUID NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "enviado_por" UUID,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arquivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracao" (
    "chave" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "atualizado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_por" UUID,

    CONSTRAINT "configuracao_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" SERIAL NOT NULL,
    "operacao_id" TEXT NOT NULL,
    "acao" "AcaoAuditoria" NOT NULL,
    "usuario_id" UUID,
    "dados" JSONB,
    "em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_login_key" ON "usuarios"("login");

-- CreateIndex
CREATE INDEX "usuarios_perfil_id_idx" ON "usuarios"("perfil_id");

-- CreateIndex
CREATE UNIQUE INDEX "perfis_nome_key" ON "perfis"("nome");

-- CreateIndex
CREATE INDEX "operacoes_num_idx" ON "operacoes"("num");

-- CreateIndex
CREATE INDEX "operacoes_tipo_idx" ON "operacoes"("tipo");

-- CreateIndex
CREATE INDEX "operacoes_cliente_idx" ON "operacoes"("cliente");

-- CreateIndex
CREATE INDEX "operacoes_atualizado_em_idx" ON "operacoes"("atualizado_em" DESC);

-- CreateIndex
CREATE INDEX "auditoria_operacao_id_em_idx" ON "auditoria"("operacao_id", "em" DESC);

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfis_permissoes" ADD CONSTRAINT "perfis_permissoes_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfis_permissoes" ADD CONSTRAINT "perfis_permissoes_permissao_chave_fkey" FOREIGN KEY ("permissao_chave") REFERENCES "permissoes"("chave") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacoes" ADD CONSTRAINT "operacoes_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_enviado_por_fkey" FOREIGN KEY ("enviado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Visão de relatório: uma linha por operação, com os campos principais
CREATE OR REPLACE VIEW vw_operacoes AS
SELECT
  o.id, o.num, o.tipo, o.cliente, o.controlador,
  to_timestamp(o.criado_em / 1000.0)     AS aberta_em,
  to_timestamp(o.atualizado_em / 1000.0) AS atualizada_em,
  coalesce(o.dados#>>'{leit,caminhaoVazio,placa}', o.dados#>>'{leit,crlv,placa}') AS placa,
  o.dados#>>'{leit,motorista,nome}'                AS motorista,
  (o.dados#>>'{leit,pesagemTara,kg}')::numeric     AS tara_kg,
  (o.dados#>>'{leit,pesagemBruta,kg}')::numeric    AS bruta_kg,
  (o.dados#>>'{leit,pesagemRetorno,kg}')::numeric  AS pos_limpeza_kg,
  o.dados#>>'{leit,nf1,numero}'                    AS nf1,
  (o.dados#>>'{leit,nf1,valorTotal}')::numeric     AS nf1_valor,
  o.dados#>>'{leit,nf2,numero}'                    AS nf2,
  (o.dados#>>'{leit,nf2,valorTotal}')::numeric     AS nf2_valor,
  o.dados#>>'{leit,mtr1,numero}'                   AS mtr1,
  o.dados#>>'{leit,mtr2,numero}'                   AS mtr2,
  (o.dados#>>'{leit,deposito,valor}')::numeric     AS deposito_valor,
  o.dados#>>'{leit,deposito,data}'                 AS deposito_data,
  coalesce((o.dados->>'demo')::boolean, false)     AS exemplo
FROM operacoes o;
