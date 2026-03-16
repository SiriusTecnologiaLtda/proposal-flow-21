

## Diagnóstico e Plano: Corrigir cópia de arquivo no Google Drive

### Problema raiz
A Service Account `proposta-bot@` tem **quota de 0 B** (contas de serviço sem Google Workspace). Quando a API `files.copy` é chamada com `parents: [folderId]`, o arquivo copiado pertence à Service Account, e a quota dela é verificada -- resultando no erro 403.

### Solução: Usar parâmetros de Shared Drives + copiar sem forçar parents

A API do Google Drive v3 tem o parâmetro `supportsAllDrives=true` que permite operar em Shared Drives (Drives compartilhados). Se a pasta destino estiver em um Shared Drive, a quota do drive é usada em vez da quota da SA.

Além disso, uma abordagem alternativa é:
1. **Copiar SEM especificar `parents`** -- o arquivo fica no "root" da SA (sem consumir quota real)
2. **Mover para a pasta destino** usando `files.update` com `addParents` e `removeParents` -- isso faz o arquivo herdar a quota do dono da pasta

### Alterações na Edge Function `generate-proposal-pdf/index.ts`

**1. Modificar a função `copyFile`:**
- Remover `parents` do body da requisição de cópia
- Adicionar `?supportsAllDrives=true` em todas as chamadas Drive
- Após a cópia, fazer uma segunda chamada `PATCH files/{id}?addParents={folderId}&removeParents={rootId}&supportsAllDrives=true` para mover o arquivo
- Logar ambas as chamadas (curl + resposta)

**2. Adicionar `supportsAllDrives=true` nas demais chamadas Drive:**
- `listTemplates` 
- `listFilesInFolder`
- `getFileInfo`
- `getDriveQuota`

**3. Arquivo alterado:**
- `supabase/functions/generate-proposal-pdf/index.ts`

### Fluxo técnico

```text
1. files.copy (sem parents) → arquivo criado no root da SA
2. files.update PATCH (addParents=pasta, removeParents=root) → move para pasta destino
3. Quota usada = do dono da pasta / Shared Drive, não da SA
```

