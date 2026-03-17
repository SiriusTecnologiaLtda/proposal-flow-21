

## Plano: Página de Integrações/APIs — Sincronização de Clientes

### Visão Geral

Criar uma nova página `IntegrationsPage` acessível via `/configuracoes/integracoes` que lista as integrações disponíveis (começando por Clientes). Cada integração permite configurar endpoint, método HTTP, autenticação, headers, body e mapeamento de campos. Uma Edge Function faz a chamada à API externa e persiste os dados na tabela `clients`.

### 1. Tabela `api_integrations` (nova migração)

Armazena as configurações de cada integração:
- `id`, `entity` (ex: "clients", "sales_team"), `label`, `endpoint_url`, `http_method` (GET/POST), `auth_type` (none/bearer/basic/api_key), `auth_value` (token/credentials), `headers` (jsonb), `body_template` (text), `field_mapping` (jsonb — ex: `{"A1_COD": "code", "A1_NOME": "name", ...}`), `last_sync_at`, `last_sync_status`, `last_sync_message`, `created_at`, `updated_at`
- RLS: SELECT para authenticated, ALL para admin

### 2. Nova página `IntegrationsPage.tsx`

- Card para cada entidade (inicialmente só "Clientes")
- Ao clicar, abre dialog/formulário com:
  - **Endpoint URL** (input text)
  - **Método HTTP** (select: GET, POST)
  - **Autenticação** (select: Nenhuma, Bearer Token, Basic Auth, API Key)
  - **Campo de auth** (input para token/user:pass/key conforme seleção)
  - **Headers adicionais** (textarea JSON)
  - **Body** (textarea, habilitado só para POST)
  - **Mapeamento de campos** — tabela com 2 colunas:
    - "Campo da API" (editável)
    - "Campo do Sistema" (select fixo: code, name, cnpj, contact, phone, address, state_registration, email)
  - **Botão de ajuda (?)** — exibe um dialog/popover com o JSON esperado e a lista de campos aceitos no mapeamento
  - **Botão "Testar Conexão"** — chama a API e mostra preview dos primeiros registros
  - **Botão "Sincronizar"** — executa a importação completa

### 3. Mapeamento de campos padrão (ajuda)

O botão de ajuda mostrará:

```text
Campos esperados no retorno JSON (array de objetos):
─────────────────────────────────────────
Campo Sistema     │ Descrição
─────────────────────────────────────────
code              │ Código do cliente (obrigatório)
name              │ Razão Social (obrigatório)
cnpj              │ CNPJ (obrigatório)
contact           │ Nome do contato
email             │ E-mail
phone             │ Telefone
address           │ Endereço
state_registration│ Inscrição Estadual
─────────────────────────────────────────
```

Com mapeamento pré-preenchido baseado no exemplo do usuário:
`A1_COD → code`, `A1_NOME → name`, `A1_CGC → cnpj`, `A1_CONTATO → contact`, `A1_TEL → phone`, `A1_END → address`, `A1_EST → state_registration`

### 4. Edge Function `sync-api-clients`

- Recebe `integrationId`
- Carrega config da tabela `api_integrations`
- Faz fetch para o endpoint configurado com método/auth/headers/body
- Aplica o `field_mapping` em cada objeto do array retornado
- Para cada registro: faz upsert na tabela `clients` (match por `code` + `cnpj`)
- Retorna contagem de inseridos/atualizados/erros
- Atualiza `last_sync_at/status/message` na tabela

### 5. Roteamento

- `SettingsPage`: card "Integrações / APIs" navega para `/configuracoes/integracoes`
- `App.tsx`: nova rota `/configuracoes/integracoes` → `IntegrationsPage`

### Resumo de alterações

| Artefato | Ação |
|---|---|
| Migração SQL | Criar tabela `api_integrations` com RLS |
| `src/pages/IntegrationsPage.tsx` | Nova página com config, mapeamento, teste e sync |
| `src/pages/SettingsPage.tsx` | Alterar card para navegar à nova rota |
| `src/App.tsx` | Adicionar rota `/configuracoes/integracoes` |
| `supabase/functions/sync-api-clients/index.ts` | Edge function para chamar API e popular clientes |

