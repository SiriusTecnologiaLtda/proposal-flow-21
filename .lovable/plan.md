
Objetivo: corrigir a importação de clientes para que ela complete sem timeout, mostre progresso real de forma confiável e nunca deixe execuções antigas aparecendo indefinidamente como “Executando”.

Diagnóstico do que está acontecendo hoje
- A sincronização ainda tenta processar várias páginas dentro de uma única execução do backend. Os logs mostram avanço até a página 5 e depois “shutdown”, sem finalizar o registro da execução. Isso é compatível com timeout/interrupção no backend.
- O status fica preso em `running` porque, quando a execução é encerrada abruptamente, o código não chega no trecho que grava `finished_at` e troca o status para erro/sucesso.
- A barra de progresso atual usa `processados / total_records`, mas `total_records` hoje é apenas o total já lido até aquele momento, não o total esperado da importação inteira. Por isso o percentual pode parecer “correto” mas na prática é enganoso.
- Há um ponto estrutural importante no Protheus/MS SQL Server: o retorno contém `A1_COD` e `A1_LOJA`, mas hoje a gravação usa só `code` para decidir insert/update. Isso pode fazer clientes de lojas diferentes colidirem entre si e reduzirem artificialmente o total importado.

Plano de correção completo

1. Reestruturar a sincronização para ser resumível
- Trocar o modelo “uma chamada importa tudo” por “cada chamada processa apenas 1 página”.
- Persistir no banco o estado da execução atual: offset atual, página atual, última atividade, total lido, total gravado, quantidade de erros, última página processada e último erro.
- Ao terminar uma página:
  - grava os contadores;
  - atualiza `heartbeat_at`;
  - define se ainda há próxima página;
  - encerra ou deixa pronta a próxima continuação.
- Assim, cada chamada fica curta e previsível, evitando timeout.

2. Separar histórico de execução de progresso operacional
- Manter `sync_logs` como histórico geral da execução.
- Adicionar campos operacionais nele ou criar uma tabela complementar de progresso por execução, com:
  - `status` (`queued`, `running`, `success`, `error`, `timeout`, `cancelled`)
  - `heartbeat_at`
  - `current_offset`
  - `page_size`
  - `pages_processed`
  - `last_page_count`
  - `records_fetched`
  - `records_inserted`
  - `records_updated`
  - `records_error`
  - `finished_at`
  - `last_error_message`
- Opcionalmente criar uma tabela de eventos por página para observabilidade:
  - `sync_log_events` ou similar
  - página, offset, duração, status HTTP, curl sanitizado, trecho da resposta, erro.

3. Corrigir a paginação para MS SQL Server de forma estável
- Continuar usando `OFFSET ... ROWS FETCH NEXT ... ROWS ONLY`, mas sempre com `ORDER BY` estável e explícito.
- Para Protheus, a ordenação não deve ser `ORDER BY 1`; o ideal é ordenar por chave consistente, por exemplo:
  - `ORDER BY A1_COD, A1_LOJA`
- A regra será:
  - se a consulta já tiver `ORDER BY`, respeitar;
  - se não tiver, injetar um `ORDER BY` configurável;
  - expor esse campo na UI para não depender de heurística.

4. Corrigir a chave de deduplicação/importação
- Hoje existe forte risco de sobrescrever registros porque o Protheus diferencia cliente por código + loja.
- Ajuste proposto:
  - incluir `store_code`/`loja` no modelo;
  - criar uma chave externa estável, ex.: `external_key = code + '-' + loja`;
  - fazer upsert por essa chave, não apenas por `code`.
- Isso evita perda silenciosa de registros e melhora a consistência dos totais.

5. Trocar processamento linha a linha por upsert em lote
- Hoje cada registro pode fazer `select` + `update/insert`, o que é caro e aumenta muito o tempo.
- Substituir por processamento em lote por página:
  - montar array mapeado;
  - validar obrigatórios;
  - fazer `upsert` em lote pela chave externa.
- Resultado esperado:
  - menos round-trips ao banco;
  - menos chance de timeout;
  - progresso mais rápido e previsível.

6. Fazer o progresso ficar realmente confiável
- Enquanto o total final não for conhecido, a UI não deve mostrar percentual “fake”.
- Comportamento novo:
  - se não houver `expected_total`, exibir progresso indeterminado + métricas reais:
    - página atual
    - offset atual
    - registros lidos
    - inseridos
    - atualizados
    - erros
    - última atividade
  - se houver total conhecido no futuro, aí sim exibir percentual real.
- Se a API permitir uma consulta de contagem, isso pode virar melhoria opcional; se não permitir, o progresso continua correto sem percentual.

7. Resolver de vez os status “Executando” presos
- Implementar reconciliação por heartbeat:
  - se uma execução estiver `running` mas sem `heartbeat_at` recente por X minutos, marcar como `timeout`.
- Aplicar essa reconciliação em 3 pontos:
  1. ao iniciar nova sincronização;
  2. ao abrir a tela de logs;
  3. opcionalmente em rotina agendada de manutenção.
- Na UI, “Executando” só aparece se o heartbeat estiver recente. Caso contrário, mostrar “Interrompida/Timeout”.

8. Melhorar a experiência na tela de logs
- Em cada execução, mostrar:
  - status real
  - início / fim
  - última atividade
  - página atual
  - offset
  - duração
  - resumo da execução
- No detalhe do log, exibir por página:
  - curl sanitizado
  - HTTP status
  - trecho do retorno
  - erro retornado
  - duração da chamada
- Adicionar ação “Atualizar status” para reconciliar execuções antigas.

9. Controle de concorrência
- Impedir duas execuções simultâneas da mesma integração.
- Se existir uma execução ativa com heartbeat recente:
  - bloquear nova execução e avisar que já há uma sincronização em andamento.
- Se existir uma execução ativa porém stale:
  - marcar como timeout e permitir nova execução.

Arquivos/áreas que precisariam ser alterados
- Banco/migração:
  - enriquecer `sync_logs` e possivelmente criar tabela de eventos por página;
  - adicionar coluna de loja/chave externa em `clients`;
  - índice/constraint para upsert confiável.
- Backend da sincronização:
  - refatorar `sync-api-clients` para processar uma página por vez, com estado persistido.
  - opcional: criar função auxiliar de reconciliação de execuções stale.
- UI:
  - `IntegrationsPage.tsx` para:
    - progresso indeterminado quando necessário;
    - status real com heartbeat;
    - detalhes por página;
    - botão de atualizar status;
    - configuração de `ORDER BY` estável.
- Tipagem:
  - refletir os novos campos de execução/progresso.

Ordem de implementação recomendada
1. Corrigir modelo de dados da execução e reconciliação de status.
2. Refatorar backend para 1 página por chamada + heartbeat.
3. Corrigir chave de importação (`code + loja`) e upsert em lote.
4. Ajustar UI de progresso/logs para ler o novo estado.
5. Validar com importação grande e confirmar que:
   - não há timeout;
   - nenhuma execução fica presa em “Executando”;
   - os totais batem com o Protheus.

Detalhes técnicos
```text
Fluxo novo

Usuário inicia sync
  -> cria/retoma uma execução
  -> backend processa 1 página
  -> grava heartbeat + contadores + próximo offset
  -> se houver mais páginas, continua via próxima chamada curta
  -> se não houver mais páginas, marca success + finished_at

Tela de progresso
  -> consulta a execução atual
  -> mostra heartbeat, página, offset, lidos, inseridos, atualizados, erros
  -> só mostra % se houver total conhecido
  -> se heartbeat expirar, muda status para timeout
```

Resultado esperado
- Importação completa sem depender de uma única execução longa.
- Progresso consistente e compreensível.
- Logs detalhados por página.
- Nenhum status preso incorretamente em “Executando”.
- Contagem de clientes mais confiável para Protheus, sem colisão entre código e loja.
