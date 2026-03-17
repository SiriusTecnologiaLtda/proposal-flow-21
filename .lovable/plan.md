

## Plano: Melhorias na Página de Integrações

### Requisitos
1. Limitar a 1 integração por entidade (se já existe para "clients", botão "Nova" some e vira "Configurar")
2. Agendamento configurável (dias da semana + horário)
3. Log de sincronizações com histórico de erros/totais
4. Console de progresso ao sincronizar manualmente
5. Evitar timeout processando em lotes

---

### 1. Migração SQL

**Novos campos em `api_integrations`:**
- `schedule_enabled` (boolean, default false)
- `schedule_cron` (text, nullable) — expressão cron gerada a partir da UI
- `schedule_days` (jsonb, default '[]') — array de dias: ["mon","tue",...]
- `schedule_time` (text, nullable) — horário HH:MM

**Nova tabela `sync_logs`:**
- `id` (uuid PK)
- `integration_id` (uuid FK → api_integrations)
- `started_at` (timestamptz)
- `finished_at` (timestamptz, nullable)
- `status` (text: running/success/error)
- `total_records`, `inserted`, `updated`, `errors` (integer, default 0)
- `error_message` (text, nullable)
- `trigger_type` (text: manual/scheduled)

RLS: SELECT para authenticated, INSERT/UPDATE/DELETE via service role (edge function).

**Unique constraint** em `api_integrations(entity)` para impedir duplicatas.

### 2. Edge Function `sync-api-clients` — Reescrita

- **Processamento em lotes** de 50 registros por vez (evita timeout)
- **Cria registro em `sync_logs`** com status "running" no início
- **Atualiza `sync_logs`** com contadores progressivos a cada lote
- **Ao final**, marca status success/error e `finished_at`
- **Streaming response** (opcional): retorna resultado final com totais

### 3. UI — `IntegrationsPage.tsx`

**Integração única por entidade:**
- Se já existe integração para "clients", o botão muda para "Configurar" (abre edição)
- Não permite criar segunda integração

**Agendamento (dentro do dialog de config):**
- Toggle "Agendamento automático"
- Seleção de dias da semana (checkboxes: Seg, Ter, Qua, ...)
- Input de horário (HH:MM)
- Salva junto com a integração

**Botão "Ver Logs":**
- Abre dialog com tabela de `sync_logs` ordenada por `started_at DESC`
- Colunas: Data/Hora, Tipo (manual/agendado), Status, Total, Inseridos, Atualizados, Erros, Mensagem
- Limitado aos últimos 50 registros

**Console de progresso ao sincronizar:**
- Ao clicar "Sincronizar", abre dialog com console
- Polling a cada 2s na tabela `sync_logs` (WHERE status = 'running')
- Mostra barra de progresso e contadores em tempo real
- Quando status muda para success/error, para o polling e mostra resultado final

### 4. Cron Job (pg_cron)

- Após salvar agendamento, montar expressão cron a partir de dias + horário
- Usar `pg_cron` + `pg_net` para chamar a edge function no horário configurado
- Gerenciado via insert tool (não migração, pois contém dados específicos)

---

### Resumo de alterações

| Artefato | Ação |
|---|---|
| Migração SQL | Adicionar campos schedule em `api_integrations`, criar `sync_logs`, unique constraint em entity |
| `supabase/functions/sync-api-clients/index.ts` | Reescrever com lotes + logs na tabela `sync_logs` |
| `src/pages/IntegrationsPage.tsx` | Única integração/entidade, agendamento, log viewer, console de progresso |

