

## Plano de Implementação

### 1. Adicionar kenny.martins@totvs.com.br como admin

O usuário já existe com `user_id = 7386e88d-482e-4778-99b0-44e612c49870`. Basta inserir um registro na tabela `user_roles` via migração SQL.

### 2. Login com Google OAuth 2.0

O Lovable Cloud oferece Google OAuth gerenciado nativamente. A implementação usará o módulo `lovable.auth.signInWithOAuth("google", ...)`.

**Etapas:**
- Usar a ferramenta "Configure Social Login" para gerar o módulo `src/integrations/lovable/`
- Adicionar botão "Entrar com Google" na `LoginPage.tsx`, chamando `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`
- Manter o formulário de e-mail/senha existente como alternativa

### 3. Mostrar URLs de configuração na tela de Configurações

Na página de Google Drive/Docs (ou numa seção dedicada), exibir:
- **Domínio autorizado:** `lovable.app` (e domínio customizado se houver)
- **URL de redirecionamento:** `https://vpyniuyqmseusowjreth.supabase.co/auth/v1/callback`

Esses dados serão exibidos como campos somente-leitura com botão de copiar, na página de Configurações, dentro de um novo card ou na página Google Integration.

### Resumo de alterações

| Arquivo | Ação |
|---|---|
| Migração SQL | INSERT admin role para kenny.martins |
| `src/pages/LoginPage.tsx` | Adicionar botão Google OAuth |
| `src/integrations/lovable/` | Gerado automaticamente pela ferramenta |
| `src/pages/SettingsPage.tsx` ou `GoogleIntegrationPage.tsx` | Exibir URLs autorizadas e de redirecionamento |

