

## Plan: Controle de Acesso a Propostas por Usuário

### Problema
Atualmente, todos os usuários autenticados veem todas as propostas. A regra desejada:
- Usuário vê propostas que **ele criou** (`created_by`)
- OU propostas onde seu **email** está vinculado a um membro do time de vendas (ESN, GSN ou Arquiteto) associado à proposta
- **Admins** continuam vendo tudo

### Solução

#### 1. Criar função `can_view_proposal` (security definer)
Função SQL que recebe `_user_id uuid` e `_proposal_id uuid` e retorna `boolean`:
- Verifica se é admin → `true`
- Verifica se `created_by = _user_id` → `true`
- Busca o email do usuário em `auth.users`
- Busca membros do `sales_team` com esse email
- Verifica se algum desses IDs está em `esn_id`, `gsn_id` ou `arquiteto_id` da proposta

#### 2. Atualizar RLS policy da tabela `proposals`
Substituir a política SELECT atual (que permite tudo com `true`) por uma que usa `can_view_proposal(auth.uid(), id)`.

#### 3. Dashboard e Listagem
Nenhuma mudança no código frontend necessária — o filtro será aplicado automaticamente pelo RLS no banco. As queries de `useProposals()` e `useProposal()` já passam pelo RLS, então Dashboard e ProposalsList respeitarão a regra automaticamente.

#### 4. Manter acesso irrestrito a outras entidades
Clientes, templates, time de vendas etc. continuam visíveis a todos os autenticados (sem mudança).

### Resumo das alterações
- **1 migration SQL**: criar função `can_view_proposal` + substituir RLS policy de SELECT em `proposals`
- **0 alterações no frontend**: o RLS faz o filtro transparentemente

