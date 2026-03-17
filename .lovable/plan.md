

## Plano: Paginação na Sincronização de Clientes

### Problema
A Edge Function faz uma única chamada à API externa, que retorna apenas uma página de resultados (provavelmente limitada pelo servidor). Resultado: importa bem menos clientes do que o total.

### Solução
Implementar paginação `offset + limit` na Edge Function, fazendo múltiplas chamadas à API até esgotar os registros.

### 1. Novos campos na configuração (`api_integrations`)

Migração SQL para adicionar:
- `pagination_enabled` (boolean, default false)
- `pagination_type` (text, default 'offset_limit') — para futuras opções
- `pagination_param_offset` (text, default 'offset') — nome do query param de offset
- `pagination_param_limit` (text, default 'limit') — nome do query param de limit  
- `pagination_page_size` (integer, default 200) — registros por página

### 2. Edge Function (`sync-api-clients/index.ts`)

Quando `pagination_enabled = true`:
1. Cria o `sync_log` com status "running"
2. Loop: chama a API com `?offset=0&limit=200`, depois `?offset=200&limit=200`, etc.
3. Para cada página, processa os registros em lotes de 50 (upsert no `clients`)
4. Atualiza `sync_logs` com contadores após cada lote
5. Condição de parada: quando a API retorna menos registros que `page_size` (ou array vazio)
6. Para POST: injeta offset/limit no body JSON em vez de query params

### 3. UI — `IntegrationsPage.tsx`

Dentro do dialog de configuração, adicionar seção "Paginação":
- Toggle "API paginada"
- Input "Tamanho da página" (default 200)
- Input "Param offset" (default "offset")
- Input "Param limit" (default "limit")

### Resumo de alterações

| Artefato | Ação |
|---|---|
| Migração SQL | Adicionar campos de paginação em `api_integrations` |
| `supabase/functions/sync-api-clients/index.ts` | Loop de paginação offset+limit com múltiplas chamadas à API |
| `src/pages/IntegrationsPage.tsx` | Seção de configuração de paginação no dialog |

