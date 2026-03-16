

## Plano: Botão de Teste de Conexão Google com Console de Execução

### O que será feito

Adicionar um botão "Testar conexão" em cada linha da tabela de integrações Google. Ao clicar, abre um dialog/modal com um console em tempo real mostrando cada etapa do teste (autenticação, listagem de arquivos na pasta, resultado).

### Implementação

**1. Criar Edge Function `test-google-connection`**
- Nova edge function simples que recebe `integrationId`
- Busca as credenciais da tabela `google_integrations` usando service role
- Executa: parse do JSON → autenticação OAuth → lista arquivos na pasta do Drive
- Retorna log detalhado de cada etapa (sucesso/erro) como array de mensagens

**2. Atualizar `GoogleIntegrationPage.tsx`**
- Adicionar botão "Testar" (ícone Play/Zap) em cada linha da tabela, ao lado de Editar/Excluir
- Novo estado para controlar o dialog de console e os logs
- Dialog com fundo escuro estilo terminal, mostrando cada linha de log com timestamp
- Ao abrir, faz fetch à edge function e exibe os logs progressivamente
- Status final: verde (sucesso) ou vermelho (erro)

### Detalhes técnicos

A edge function `test-google-connection` fará:
1. Buscar registro por ID na tabela `google_integrations`
2. Parsear `service_account_key` como JSON
3. Gerar JWT e obter access token do Google
4. Listar arquivos na pasta `drive_folder_id`
5. Retornar array de `{ step, status, message, timestamp }`

O console no frontend será um `<div>` com scroll automático, fonte mono, fundo escuro, exibindo cada etapa com ícones de status (✓ / ✗).

