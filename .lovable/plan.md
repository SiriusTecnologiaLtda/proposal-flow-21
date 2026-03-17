

## Diagnóstico

O problema é que `handleSync` faz `await res.json()` na resposta da Edge Function, mas a Edge Function só retorna a resposta **depois de processar todos os registros**. Ou seja, o `logId` só chega ao cliente quando já acabou tudo — o polling nunca vê o status "running".

## Solução

Duas mudanças coordenadas:

### 1. Edge Function (`sync-api-clients/index.ts`)
- Após criar o registro em `sync_logs` e **antes de processar os registros**, retornar imediatamente `{ logId }` ao cliente
- Usar `waitUntil` pattern (EdgeRuntime) ou processar em background via `Promise` sem aguardar, para que o Deno continue executando após retornar a Response
- Na prática em Deno Deploy: usar `evt.waitUntil()` não é disponível, então a solução é **não usar streaming** e sim fazer o cliente não aguardar a resposta

### 2. Cliente (`IntegrationsPage.tsx` - `handleSync`)
- Disparar o `fetch` sem `await` na resposta completa
- Em vez disso, imediatamente após disparar, fazer polling em `sync_logs` filtrando pelo `integration_id` + `status = 'running'` (o registro mais recente)
- O polling já existe e funciona, só precisa mudar a forma de obter o logId

### Fluxo corrigido:
1. Cliente dispara fetch (fire-and-forget, sem await no body)
2. Cliente começa polling em `sync_logs` WHERE `integration_id = X` ORDER BY `started_at DESC` LIMIT 1
3. Polling mostra progresso em tempo real
4. Quando status != 'running', para o polling

### Arquivos alterados:
| Arquivo | Mudança |
|---|---|
| `src/pages/IntegrationsPage.tsx` | `handleSync`: não awaitar resposta, polling por integration_id em vez de logId |
| `src/pages/IntegrationsPage.tsx` | Polling useEffect: buscar por integration_id quando logId não disponível |

