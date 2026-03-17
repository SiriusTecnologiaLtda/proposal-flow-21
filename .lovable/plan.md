

## Plano: Corrigir substituições e adicionar escopo detalhado ao documento

### Problemas identificados

1. **`{{ESCOPO1}}` não substituído** — O placeholder existe no template Google Docs mas não está no mapa de placeholders da edge function. Deve conter os nomes dos templates selecionados (nível mais sintético), ex: "Protheus Compras".

2. **Tabela de Condições de Pagamento (4.2) vazia** — Não há placeholders na tabela do template. O antigo Google Script localizava o texto "condições de pagamento" e inseria linhas na tabela. A edge function precisa usar a Google Docs API para encontrar a tabela e inserir as linhas de parcelas programaticamente.

3. **Escopo Detalhado não adicionado** — Ao final do documento, devem ser adicionadas páginas com o escopo detalhado: agrupado por Template (título), com tabela de 3 colunas (Processo | Resumo | Escopo) listando os processos e sub-itens, conforme o layout da imagem de referência.

---

### Alterações na Edge Function (`supabase/functions/generate-proposal-pdf/index.ts`)

#### 1. Adicionar `{{ESCOPO1}}` ao mapa de placeholders

- Construir texto com os nomes dos templates usados na proposta (ex: "Protheus Compras")
- Já existe `macroScopeNames` (linha 426) — basta adicionar ao mapa:
  ```
  "{{ESCOPO1}}": macroScopeNames.join(", ")
  ```

#### 2. Inserir linhas na tabela de Condições de Pagamento

Em vez de usar placeholder, usar a **Google Docs API** para:
1. Fazer `GET /documents/{docId}` para ler a estrutura do documento
2. Encontrar a tabela que vem logo após o texto "condições de pagamento" (ou "Condições de pagamento")
3. Para cada parcela, inserir uma linha na tabela com 3 colunas: Quantidade de Parcelas, Primeiro Vencimento, Valor total (Líquido)
4. Usar `batchUpdate` com requests `insertTableRow` + `insertText` para preencher as células

#### 3. Adicionar páginas de Escopo Detalhado ao final

Após a substituição de placeholders:
1. Fazer `GET /documents/{docId}` para obter o `endIndex` do body
2. Usar `batchUpdate` com requests para inserir no final do documento:
   - Page break
   - Título "Proposta Projeto Implantação" + "Anexo - Escopo Detalhado" (formatados)
   - Para cada template agrupado:
     - Subtítulo com nome do template (ex: "TT - BackOffice")
     - Tabela com header "Processo | Resumo | Escopo"
     - Linhas para cada processo pai (included) e seus sub-itens
     - Coluna "Escopo" = "Sim" ou "Não" baseado em `included`
     - Coluna "Resumo" = `notes` ou `description` dos sub-itens

#### Fluxo técnico

```text
1. Copiar template → newDocId
2. batchReplace (placeholders simples incluindo {{ESCOPO1}})
3. GET doc structure → encontrar tabela de pagamento → inserir linhas
4. GET doc endIndex → inserir escopo detalhado (page break + títulos + tabelas)
```

### Novas funções a criar na edge function

- `getDocumentStructure(accessToken, docId)` — GET document JSON
- `findPaymentTable(docContent)` — localiza tabela após texto "condições de pagamento"
- `insertPaymentRows(accessToken, docId, tableIndex, payments)` — insere linhas com dados
- `appendDetailedScope(accessToken, docId, scopeItems, templateNames)` — adiciona páginas de escopo detalhado com formatação

### Arquivo alterado
- `supabase/functions/generate-proposal-pdf/index.ts`

