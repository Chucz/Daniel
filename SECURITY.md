# EduScale: segurança e operação

## Publicação

O Netlify executa `npm run build` e publica apenas `dist/`. As funções permanecem em `netlify/functions`. Não publique a raiz do repositório, arquivos .env, esquema, testes, ferramentas ou credenciais. O build copia bibliotecas de versões fixas do package-lock; scripts de CDN não são necessários.

## Acesso individual

As contas estão em `public.app_users`. Senhas usam scrypt com salt aleatório; o servidor só armazena hashes. O login usa e-mail. `must_change_password=true` obriga definir uma nova senha antes de acessar a grade. A senha compartilhada antiga (`AUTH_USER`/`AUTH_PASSWORD`) deixou de ser aceita pelo servidor. As variáveis antigas podem ser removidas nas configurações do Netlify; nunca publique seus valores.

Novas contas devem ser provisionadas pelo administrador com nome, e-mail e função, hash gerado pelo mesmo `hashPassword` do servidor, `active=true` e troca obrigatória. Não existe cadastro público de usuários. A conta inicial foi provisionada para o administrador indicado pelo responsável pela escola. Nunca coloque senhas temporárias em SQL versionado, commits ou relatórios públicos.

A troca de senha revoga as outras sessões. Para revogar uma conta, configure `active=false` no banco. Sessões antigas do login compartilhado não têm user_id e são rejeitadas. A opção de permanecer conectado dura até sete dias; sessões normais duram oito horas.

## Proteções do cliente

Dados de professores são codificados antes da renderização. Eventos são callbacks JavaScript, associados via addEventListener; não há interpretação de JavaScript recebido do HTML. A política CSP bloqueia scripts externos, scripts inline e handlers inline. Não adicione eval, Function ou unsafe-inline para contornar uma violação de CSP.

## Gravação e recuperação

O GET da grade retorna um ETag. PUT exige If-Match com a revisão lida; a comparação ocorre dentro de uma transação com lock no Postgres. Gravações concorrentes desatualizadas recebem 409; clientes antigos sem revisão recebem 428 e precisam atualizar a página. O navegador oferece download da cópia local ainda não salva antes de carregar a versão atual.

Cada gravação aceita registra antes/depois, usuário autenticado e horário na tabela schedule_audit, na mesma transação. A aplicação não tem privilégios de UPDATE ou DELETE nessa tabela. Uma cópia inicial da grade também foi registrada na ativação. Não é possível reconstruir autoria de alterações anteriores à implantação.

A função declarada do responsável pela escolha é diferente de `substitutionRecordedBy`, e-mail do operador autenticado definido pelo servidor. Registros antigos continuam sem autoria inventada. Metadados enviados pelo navegador não substituem a identidade verificada pelo servidor.

A auditoria contém dados pessoais: permanece no banco, protegida por RLS, sem exposição a anon/authenticated. Planeje retenção e restauração conforme as necessidades da escola. O histórico de versões no banco não substitui um backup externo: confirme no painel Supabase o plano/retensão e teste uma restauração antes de depender de uma recuperação de desastre.

## Banco

A alteração aditiva está em db/security-hardening.sql e foi aplicada pelo gerenciamento de migrações do Supabase. Não execute novamente sem verificar o histórico. Não elimina dados de professores, substituições ou sessões existentes. As tabelas têm RLS e acesso de servidor por eduscale_app, sem superusuário ou bypassrls. O driver requer SUPABASE_DATABASE_URL configurada no Netlify. Não trocar o banco ativo sem migrar dados e esquema primeiro.

## Verificação recorrente

Execute `npm ci`, `npm run build`, `npm test` e `npm audit`. Teste login, troca de senha, alocação, conflitos, edição e PDF. Verifique cabeçalhos CSP/nosniff/frame-ancestors após a publicação. Proteja também as contas de administração do GitHub, Netlify e Supabase com MFA e menor privilégio. Estas medidas reduzem risco; não são garantia de ausência total de falhas.
