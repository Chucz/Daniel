# Ocorrências por data e operação

## Comportamento

A grade recorrente (`lesson`) fica separada de faltas e substituições (`occurrence`, chave por data e aula). O seletor Data das aulas carrega a semana correspondente, no calendário da escola (America/Sao_Paulo). Relatórios e PDFs usam esse período. O titular é fotografado na ocorrência para preservar consultas históricas; mudanças posteriores na grade não reescrevem esse histórico.

Cada professor, aula e ocorrência possui versão própria. PATCH envia somente os registros alterados, em transação com auditoria. Um conflito devolve 409 e mantém o aviso, a cópia local para download e a opção de carregar os dados atuais. Registros diferentes podem ser gravados sem disputar a revisão global. O antigo PUT completo devolve 428 para impedir que clientes antigos sobrescrevam o novo modelo.

## Migração e publicação

Aplicar `db/dated-records-and-operations.sql` uma única vez, após as três configurações anteriores e antes de publicar os novos endpoints. É uma migração aditiva e transacional: cria tabelas, índices, RLS e uma coluna na sessão. Não apaga nem atualiza o JSON original de schedules nem seus históricos. Não altera senhas ou perfis.

Professores e aulas recorrentes são copiados do armazenamento anterior. Faltas e substituições sem data ficam em `legacy`, classificadas como testes. O administrador usa Operação para revisar cada registro e associá-lo ao dia correspondente da semana corrente, confirmando sua senha quando necessário. Não há associação automática. Uma ocorrência já existente impede a importação; o original continua preservado. A origem de teste aparece na consulta e no PDF.

Durante a implantação, impedir gravações na versão antiga entre a migração e a troca das funções. Comparar contagens e a grade antes/depois e publicar os arquivos e funções juntos. Clientes antigos devem atualizar a página. Se for necessário reverter a interface, manter a migração; não voltar a liberar PUT antigo, pois isso criaria duas fontes de gravação divergentes. Não executar a migração novamente para restaurar dados.

## Recuperação e confirmação de identidade

Minha conta permite gerar dez códigos aleatórios de uso único após informar a senha atual. O banco guarda somente SHA-256 de códigos com 160 bits aleatórios. A resposta que contém os códigos é no-store e eles só são exibidos na geração, com download opcional. Novos códigos invalidam os anteriores. Não são guardados no localStorage e não são enviados por e-mail.

A recuperação exige e-mail, código válido e nova senha. Consome o código em transação, revoga todas as sessões e não reativa contas desativadas. A redefinição administrativa também invalida os códigos anteriores. Sem senha e sem código previamente guardado, é necessária intervenção de suporte; não há recuperação automática por identidade presumida.

Alterações administrativas de usuários e importações de legado exigem confirmação da senha da sessão nos últimos cinco minutos. A autorização permanece no servidor, associada à sessão, sem confiar em flags do navegador. Isso não é MFA. Nenhum backup ou serviço pago foi adicionado.

## Saúde e eventos

As rotas autenticadas /api/health e /api/operations verificam o serviço. Somente administrador vê os eventos. O cliente envia códigos fixos de falha, área e status, sem mensagens, URL, dados da grade, stack, senha ou token. Erros internos de gravação recebem identificador de correlação, sem expor a exceção ao navegador. A tela consulta até 100 eventos recentes.

A verificação do cliente ocorre a cada minuto enquanto a página está visível. Não é monitoramento externo contínuo, não envia alertas e não mede SLA. A tabela de eventos e os históricos crescem; avaliar retenção e arquivamento conforme o uso, sem exclusão automática nesta mudança.

## Verificação

`npm run verify` compila e executa os testes. Netlify utiliza esse comando antes do deploy. GitHub Actions executa instalação limpa, verify e auditoria de dependências. Configuração de proteção de branch é uma etapa separada da administração do repositório.

Os testes usam PostgreSQL WASM/PGlite isolado com handlers reais, usuários fictícios e senhas sintéticas. Cobrem migração, RLS, perfis, conta principal, troca obrigatória, revogação, duplicidade, confirmação de identidade, recuperação, datas, importação, auditoria e conflitos. `npm run test:load` mede 5 e 10 usuários em banco local com 645 aulas; não é garantia de capacidade em Netlify/Supabase. O motor local serializa conexões e não mede rede, cold starts ou limites do provedor.
