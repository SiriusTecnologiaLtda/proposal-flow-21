

## Plano: Card de Configuração Google Drive/Docs na página de Configurações

### Problema
As credenciais do Google (Service Account Key e Folder ID) são gerenciadas manualmente via secrets do backend, o que causa erros de formatação e dificulta a manutenção. O usuário quer uma interface na plataforma para configurar isso.

### Abordagem

**1. Criar tabela `google_integrations` no banco**
- Campos: `id`, `label` (nome da conexão), `service_account_key` (text, JSON completo), `drive_folder_id` (text), `created_at`, `updated_at`
- RLS: somente admins podem gerenciar; autenticados podem visualizar
- Permite múltiplas conexões (uma por unidade, por exemplo)

**2. Criar página `GoogleIntegrationPage`**
- Listagem das conexões configuradas com opção de editar/excluir
- Formulário (dialog) para criar/editar uma conexão:
  - Campo: Nome/Label da conexão
  - Campo: ID da pasta do Google Drive
  - Campo: JSON da Service Account (textarea grande)
  - Validação: verifica se o JSON é válido antes de salvar
- Rota: `/configuracoes/google`

**3. Adicionar card na SettingsPage**
- Novo card "Google Drive / Docs" com ícone adequado e descrição "Configurar credenciais de acesso ao Google Drive e Docs para geração de propostas"
- Navega para `/configuracoes/google`

**4. Atualizar a Edge Function `generate-proposal-pdf`**
- Em vez de ler `GOOGLE_SERVICE_ACCOUNT_KEY` e `GOOGLE_DRIVE_FOLDER_ID` dos secrets/env, buscar da tabela `google_integrations` (usa a primeira entrada ou permite selecionar por proposta/unidade futuramente)
- Fallback: se não encontrar na tabela, tenta os secrets existentes para manter compatibilidade

**5. Registrar rota no App.tsx**
- Adicionar `/configuracoes/google` apontando para `GoogleIntegrationPage`

### Segurança
- A Service Account Key ficará armazenada no banco com RLS restrito a admins
- A Edge Function usa `SUPABASE_SERVICE_ROLE_KEY` para acessar, então não depende de RLS do usuário final

