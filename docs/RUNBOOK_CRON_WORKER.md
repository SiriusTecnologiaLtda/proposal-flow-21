# Runbook — Cron / Worker de Extração

## 1. Verificar se cron está ativo

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('extraction-worker-poll', 'extraction-health-check');
```

**Esperado**: dois jobs com `active = true`.

| Job | Schedule |
|-----|----------|
| `extraction-worker-poll` | `* * * * *` (1 min) |
| `extraction-health-check` | `*/5 * * * *` (5 min) |

---

## 2. Verificar últimas execuções

```sql
SELECT jobid, status, start_time, end_time, return_message
FROM cron.job_run_details
WHERE jobid IN (
  SELECT jobid FROM cron.job
  WHERE jobname IN ('extraction-worker-poll', 'extraction-health-check')
)
ORDER BY start_time DESC
LIMIT 10;
```

**Esperado**: `status = 'succeeded'` nas últimas execuções.

---

## 3. Testar autenticação do worker

### Sem secret (deve retornar 401)

```bash
curl -s -w "%{http_code}" -o /dev/null \
  -X POST "<SUPABASE_URL>/functions/v1/extraction-worker" \
  -H "Content-Type: application/json" \
  -d '{"source":"test"}'
```

### Secret inválido (deve retornar 401)

```bash
curl -s -w "%{http_code}" -o /dev/null \
  -X POST "<SUPABASE_URL>/functions/v1/extraction-worker" \
  -H "Content-Type: application/json" \
  -H "X-Worker-Secret: valor-invalido" \
  -d '{"source":"test"}'
```

### Secret válido (deve retornar 200)

```bash
curl -s -X POST "<SUPABASE_URL>/functions/v1/extraction-worker" \
  -H "Content-Type: application/json" \
  -H "X-Worker-Secret: $EXTRACTION_WORKER_SECRET" \
  -d '{"source":"test"}'
```

**Nunca usar o valor real do secret em scripts versionados.**

---

## 4. Reativar cron em caso de incidente

Se os jobs estiverem inativos ou ausentes, recriar manualmente:

```sql
-- Remover agendamentos existentes (seguro, não falha se inexistente)
DO $$ BEGIN PERFORM cron.unschedule('extraction-worker-poll'); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'extraction-worker-poll não encontrado, ignorando'; END; $$;
DO $$ BEGIN PERFORM cron.unschedule('extraction-health-check'); EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'extraction-health-check não encontrado, ignorando'; END; $$;

-- Recriar com secret real (substituir placeholders)
SELECT cron.schedule(
  'extraction-worker-poll',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/extraction-worker',
    body := '{"source":"cron"}'::jsonb,
    headers := '{"Content-Type":"application/json","X-Worker-Secret":"<WORKER_SECRET>"}'::jsonb
  ) AS request_id;
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
  ) AS request_id;
  $$
);
```

**⚠️ Este SQL deve ser executado apenas no ambiente, nunca commitado no repositório.**

**⚠️ Após executar, limpe imediatamente o histórico da query tool / SQL Editor para não reter o secret em texto puro.**

---

## 5. Checklist pós-deploy

- [ ] **Cron ativo**: Executar query do passo 1 — ambos os jobs com `active = true`
- [ ] **Execuções recentes**: Executar query do passo 2 — últimas execuções com `succeeded`
- [ ] **Auth worker**: Testar os 3 cenários do passo 3 (401/401/200)
- [ ] **Healthcheck OK**: Chamar healthcheck e verificar `healthy: true`
- [ ] **Fila limpa**: Verificar que não há jobs presos:
  ```sql
  SELECT status, count(*) FROM extraction_jobs
  WHERE status IN ('queued', 'running')
  GROUP BY status;
  ```

---

## 6. Condições de alerta (monitoradas pelo healthcheck)

| Condição | Threshold | Severidade |
|----------|-----------|------------|
| Jobs `running` com heartbeat > 10 min | ≥ 1 | 🔴 Crítico |
| Jobs `queued` com available_at > 15 min | ≥ 1 | 🟡 Atenção |
| Falhas nos últimos 30 min | ≥ 3 | 🟡 Atenção |
| Fila crescendo | > 20 queued | 🟡 Atenção |

Alertas são logados como `console.error` pelo healthcheck e visíveis nos logs da edge function.

---

## 7. Ação corretiva para jobs presos

```sql
-- Falhar jobs running sem heartbeat recente
UPDATE extraction_jobs
SET status = 'failed',
    error_code = 'TIMEOUT',
    error_message = 'Manual: heartbeat expirado',
    finished_at = now()
WHERE status = 'running'
  AND heartbeat_at < now() - interval '10 minutes';

-- Requeue jobs queued antigos (reset available_at)
UPDATE extraction_jobs
SET available_at = now()
WHERE status = 'queued'
  AND available_at < now() - interval '15 minutes';
```
