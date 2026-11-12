# Gerenciamento de usuários — implantação e operação

## Entrega preparada

A área Gerenciar usuários fica no cabeçalho, visível somente para administradores. Usa os componentes, cores e navegação do EduScale. Cadastro público e envio de e-mails não foram adicionados.

Perfis:

| Perfil | Grade, professores, faltas e substituições | Relatórios e PDF | Usuários e histórico administrativo |
|---|---|---|---|
| Administrador | Edita | Consulta e exporta | Gerencia |
| Editor | Edita | Consulta e exporta | Sem acesso |
| Consulta | Somente leitura | Consulta e exporta | Sem acesso |

As permissões são verificadas no servidor a cada solicitação, usando o usuário atual do banco. Alterar o perfil afeta as sessões já abertas; o cliente também atualiza a interface ao voltar para a janela e a cada 30 segundos. Uma requisição de gravação proibida atualiza o perfil antes de informar o erro. A cópia local de alterações pendentes continua disponível no aviso de gravação.

## Conta principal

A migração identifica a conta existente de danielchuczman@gmail.com e marca is_primary=true. Sua senha, nome, ID e sessões não são redefinidos. A API não aceita isPrimary nem e-mail em alterações. Desativação, rebaixamento, troca da identidade e exclusão da conta principal também são impedidos por trigger no banco. Outro administrador não pode redefinir sua senha; o titular usa Minha conta com a senha atual.

Administradores adicionais podem ser gerenciados pela conta principal. A interface/API bloqueia que um administrador remova seu próprio acesso ou redefina sua própria senha por essa área, evitando perder a sessão e o segredo gerado. A troca da própria senha permanece em Minha conta.

## Senhas temporárias

São geradas no servidor com 24 bytes aleatórios, armazenadas somente como hash scrypt com salt aleatório e exibidas na resposta única de cadastro/redefinição. Listagens e histórico nunca retornam hashes, senhas ou tokens. As respostas usam no-store. Ao sair da área ou fechar o aviso, a senha deixa de estar disponível. Se uma resposta se perder ou a senha for esquecida antes de ser entregue, atualize a lista e gere outra; não há consulta posterior ao segredo anterior.

O administrador entrega a senha por um canal seguro, sem e-mail automático. O primeiro acesso obriga trocá-la antes de liberar a grade ou a administração. Desativação e redefinição revogam as sessões na mesma transação da operação e do histórico. Reativar uma conta não restaura cookies antigos.

## Concorrência e auditoria

O controle X-Schedule-Revision da grade e seu histórico permanecem. Uma revisão antiga recebe 409, sem substituir a versão de outro dispositivo. A autoria autenticada continua separada da função declarada de quem decidiu a substituição.

Alterações de usuários também usam version; uma tela administrativa desatualizada precisa atualizar a lista antes de editar. Cadastro, alteração, ativação, desativação e redefinição entram em user_audit, com autor, alvo, data e metadados seguros, na mesma transação. Erro na auditoria reverte a operação. RLS bloqueia acesso público, e o papel do servidor não recebe UPDATE ou DELETE no histórico.

Sessões têm um endpoint próprio (/api/session), com limite de 300 requisições/minuto por IP/domínio. O orçamento mais restrito de login permanece em 20 por minuto, sem ser consumido pela consulta periódica de sessão. Os testes locais não exercitam os limitadores de borda do Netlify.

## Implantação

1. Revisar o diff e os testes da entrega. A publicação exige autorização do responsável.
2. Após autorização, conferir novamente o HEAD remoto e os dados/constraints do banco.
3. Aplicar db/user-management.sql pelo gerenciamento de migrações do Supabase, depois da migração de segurança existente. Não reaplicar uma migração já registrada.
4. A migração é aditiva. Interrompe se houver conta principal ausente/inativa, e-mails duplicados por maiúsculas/minúsculas ou perfis desconhecidos; esses casos exigem análise, sem excluir registros automaticamente. O perfil legado gestor vira editor; contas inativas permanecem inativas; administradores existentes são mantidos. A senha principal não é alterada.
5. Verificar RLS, trigger da conta principal e permissões de user_audit.
6. Publicar código no GitHub e acompanhar o build do Netlify (dist/ continua sendo o único diretório público). Não aplicar fixtures de teste em produção.
7. Atualizar a página dos clientes e conferir a área Gerenciar usuários com o titular. Criar novos acessos reais somente quando solicitado.

Se houver necessidade de reversão, não retornar a um servidor anterior sem validação de perfis depois de criar usuários Consulta, pois essa versão antiga não implementa a restrição de escrita. Manter a migração aditiva e as proteções; corrigir/publicar uma versão com RBAC preservado.

## Testes reproduzíveis

Node.js 24. Instalar com npm ci; executar npm run build e npm test. npm run test:load executa o cenário de carga isolado; é possível passar um arquivo de resultados como argumento.

O ambiente de integração substitui o módulo de banco apenas no bundle de teste, usa PGlite/PostgreSQL em memória e nunca consulta um banco real. SQL inicial e a migração são executados localmente; contas e senhas são fictícias. Essa substituição não existe no build de produção. Artefatos .test-build não são publicados.

Foram aprovados 25 testes: 12 regressões de segurança e 13 verificações de integração, incluindo senha principal preservada, migração de perfil, duplicidade concorrente, permissões em chamadas diretas, revogação, redefinição, conta principal por API/trigger, atomicidade, RLS e roteamento dos limites de sessão/login.

No navegador local com CSP ativa: cadastro de usuário com conteúdo semelhante a HTML apareceu como texto; edição de perfil e histórico funcionaram; senha temporária desapareceu ao fechar o aviso; Consulta não mostrou controles de edição e exportou PDF; Editor cadastrou professor, alocou e editou substituto, com autoria autenticada. Tela de gerenciamento a 390 px sem rolagem horizontal.

## Carga medida

Ambiente: Node 24.22.1, Windows, Intel Core i3-1315U; PGlite 0.5.16 em memória; handlers reais por Request/Response; grade fictícia de 645 horários, aproximadamente 249 KB. Preparação das contas e do banco fora do intervalo medido.

| Usuários simultâneos | Requisições (sessão + grade) | Erros | Duração | p95 do par sessão + grade |
|---|---:|---:|---:|---:|
| 5 | 50 | 0 | 442,91 ms | 97,93 ms |
| 10 | 100 | 0 | 844,25 ms | 180,11 ms |

Dez gravações simultâneas da mesma revisão: 1 aceita, 9 conflitos esperados (409), 1 registro de auditoria, sem sobrescrita silenciosa. Duração do lote: 192,95 ms.

Esses resultados são locais e não estabelecem capacidade máxima ou SLA de produção. PGlite serializa um único motor e não simula múltiplas conexões independentes do Postgres. Latência da internet, cold start do Netlify, pool compartilhado do Supabase e limitação de borda não foram medidos. Não houve teste de carga em produção.

A consulta npm audit do lockfile retornou zero vulnerabilidades conhecidas. Isso não é garantia de ausência de todas as falhas. MFA administrativo e backups externos continuam sendo pendências operacionais já apontadas na análise anterior; não foram alterados por esta funcionalidade.
