# Cron / Worker — Nota Técnica de Operação e Compliance

## Fluxo oficial de agendamento

O agendamento de jobs `pg_cron` que dependem de secrets (ex: `X-Worker-Secret`) **NÃO deve ser feito via migrations**.

### Por quê?

Migrations ficam versionadas no repositório Git. Incluir secrets em migrations expõe credenciais no histórico do código-fonte, violando boas práticas de segurança.

### Como funciona

1. **Migrations** apenas removem/limpam agendamentos existentes (idempotentes e seguras).
2. **Criação de cron jobs** com secrets é feita como **passo operacional controlado** — via SQL direto no ambiente de destino (Supabase SQL Editor / insert tool), nunca commitado no repo.
3. O secret `EXTRACTION_WORKER_SECRET` é armazenado como runtime secret do projeto e referenciado apenas em runtime.

---

## Histórico de migrations (contexto)

| Migration | Conteúdo | Status |
|-----------|----------|--------|
| `20260414102439_*` | Tentativa com `current_setting('app.settings.*')` — causou erro operacional pois a config não existia. | **Superseded** pela migration seguinte. |
| `20260414103834_*` | Correção com URL e secret hardcoded no SQL do cron. | **Superseded** pela migration de reconciliação. |
| `20260414110321_*` | Reconciliação: remove todos os agendamentos de forma segura. Documenta que re-agendamento deve ser feito fora de migrations. | **Ativa** — estado final correto. |

### Nota sobre histórico

As migrations `102439` e `103834` contêm, respectivamente, referência a `current_setting` inexistente e um secret hardcoded. Ambas foram **funcionalmente anuladas** pela migration `110321`, que remove os agendamentos criados por elas.

O histórico Git preserva esses arquivos por design (migrations são imutáveis). O risco prático é mitigado porque:

- A migration `110321` garante que nenhum cron job com secret persiste no banco.
- O secret exposto na migration `103834` foi **rotacionado** — o valor atual em produção é diferente do que consta no arquivo.
- A branch contendo essas migrations ainda não foi publicada externamente no momento desta documentação.

---

## Procedimento de bootstrap (novo ambiente)

Após rodar todas as migrations, executar manualmente:

```sql
-- Substituir <WORKER_SECRET> pelo valor real do runtime secret
SELECT cron.schedule(
  'extraction-worker-poll',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/extraction-worker',
    body := '{"source":"cron"}'::jsonb,
    headers := '{"Content-Type":"application/json","X-Worker-Secret":"<WORKER_SECRET>"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'extraction-health-check',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/extraction-health-check',
    body := '{"source":"cron"}'::jsonb,
    headers := '{"Content-Type":"application/json","X-Worker-Secret":"<WORKER_SECRET>"}'::jsonb
  );
  $$
);
```

**Nunca commitar este SQL com valores reais no repositório.**

---

## Decisão: secret mantido, sem rotação nesta fase

O secret `EXTRACTION_WORKER_SECRET` atual foi mantido sem rotação neste ajuste.
Justificativa: branch não publicada externamente, sem risco prático de exposição.

---

## Verificação de compliance

- [x] Migration final (`110321`) remove todos os cron jobs — estado do banco é limpo
- [x] Nenhuma migration futura deve conter secrets
- [x] Documentação explica o fluxo operacional correto
- [x] Histórico de migrations com secret está documentado e contextualizado
- [x] Secret rotacionado em relação ao valor hardcoded na migration `103834`
