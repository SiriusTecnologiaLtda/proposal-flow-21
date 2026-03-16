

## Plano: Console de Execução na Geração de Propostas

### Erro Atual
O erro é: **"The user's Drive storage quota has been exceeded"** (403). A conta de serviço do Google Drive não tem mais espaço. Isso será exibido claramente no console que vamos criar.

### O que será feito

**1. Modificar a Edge Function `generate-proposal-pdf` para retornar logs detalhados**
- Adicionar um array `logs` que registra cada etapa: parse de credenciais, busca da proposta, cálculos, autenticação Google, busca de template, cópia do arquivo, substituição de placeholders
- Em caso de erro, retornar os logs acumulados até o ponto de falha junto com o erro
- Em caso de sucesso, retornar os logs completos junto com o resultado
- Cada log: `{ step: string, status: "ok" | "error", message: string, timestamp: string }`

**2. Adicionar Console Dialog na `ProposalsList.tsx`**
- Quando o usuário clicar em "Gerar Proposta", abrir um Dialog com estilo terminal (fundo escuro, fonte mono)
- Exibir os logs retornados pela edge function com ícones de status (✓ verde / ✗ vermelho)
- Mostrar indicador de carregamento enquanto a função executa
- Ao final com sucesso, mostrar botão para abrir o documento
- Ao final com erro, exibir a mensagem de erro claramente destacada

**3. Arquivos alterados**
- `supabase/functions/generate-proposal-pdf/index.ts` — adicionar sistema de logs em cada etapa
- `src/pages/ProposalsList.tsx` — substituir o toast por um Dialog console com os logs de execução

