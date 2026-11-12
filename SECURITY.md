# EduScale: segurança e operação

## Publicação

O Netlify executa `npm run verify` (build e testes) e publica apenas `dist/`. As funções permanecem em `netlify/functions`. Não publique a raiz do repositório, arquivos .env, esquema, testes, ferramentas ou credenciais. O build copia bibliotecas de versões fixas do package-lock; scripts de CDN não são necessários.

## Acesso individual

As contas estão em `public.app_users`. Senhas usam scrypt com salt aleatório; o servidor só armazena hashes. O login usa e-mail. `must_change_password=true` obriga definir uma nova senha antes de acessar a grade. A senha compartilhada antiga (`AUTH_USER`/`AUTH_PASSWORD`) deixou de ser aceita pelo servidor. As variáveis antigas podem ser removidas nas configurações do Netlify; nunca publique seus valores.

Após aplicar a migração de gerenciamento, novas contas são provisionadas na área Gerenciar usuários, restrita a administradores. O servidor gera a senha temporária, usa o mesmo hashPassword e exige a troca no primeiro acesso. Veja USER_MANAGEMENT.md para perfis, proteção da conta principal e implantação. Não existe cadastro público de usuários. A conta inicial foi provisionada para o administrador indicado pelo responsável pela escola. Nunca coloque senhas temporárias em SQL versionado, commits ou relatórios públicos.

A troca de senha revoga as outras sessões. Para revogar uma conta, configure `active=false` no banco. Sessões antigas do login compartilhado não têm user_id e são rejeitadas. A opção de permanecer conectado dura até sete dias; sessões normais duram oito horas.

## Proteções do cliente

Dados de professores são codificados antes da renderização. Eventos são callbacks JavaScript, associados via addEventListener; não há interpretação de JavaScript recebido do HTML. A política CSP bloqueia scripts externos, scripts inline e handlers inline. Não adicione eval, Function ou unsafe-inline para contornar uma violação de CSP.

## Gravação e recuperação

A grade usa PATCH com versão por registro e auditoria transacional em record_audit. Registros diferentes não disputam uma revisão global. Conflitos no mesmo registro retornam 409 e mantêm o download da cópia local. PUT completo retorna 428 para exigir atualização de clientes antigos. schedule_audit e o JSON original continuam preservados como histórico anterior. Veja OPERATIONAL_CHANGES.md para migração, datas e revisão explícita dos testes antigos.

A função declarada do responsável pela escolha é diferente de `substitutionRecordedBy`, e-mail do operador autenticado definido pelo servidor. Registros antigos continuam sem autoria inventada. Metadados enviados pelo navegador não substituem a identidade verificada pelo servidor.

A auditoria contém dados pessoais: permanece no banco, protegida por RLS, sem exposição a anon/authenticated. Planeje retenção e restauração conforme as necessidades da escola. O histórico de versões no banco não substitui um backup externo: confirme no painel Supabase o plano/retensão e teste uma restauração antes de depender de uma recuperação de desastre.

## Banco

A alteração aditiva está em db/security-hardening.sql e foi aplicada pelo gerenciamento de migrações do Supabase. Não execute novamente sem verificar o histórico. Não elimina dados de professores, substituições ou sessões existentes. As tabelas têm RLS e acesso de servidor por eduscale_app, sem superusuário ou bypassrls. O driver requer SUPABASE_DATABASE_URL configurada no Netlify. Não trocar o banco ativo sem migrar dados e esquema primeiro.

## Verificação recorrente

Execute `npm ci`, `npm run build`, `npm test` e `npm audit`. Teste login, troca de senha, alocação, conflitos, edição e PDF. Verifique cabeçalhos CSP/nosniff/frame-ancestors após a publicação. Proteja também as contas de administração do GitHub, Netlify e Supabase com MFA e menor privilégio. Estas medidas reduzem risco; não são garantia de ausência total de falhas.

Recuperação por códigos de uso único e confirmação recente da senha estão descritas em OPERATIONAL_CHANGES.md. Não há MFA, backup externo nem envio de e-mail nesta alteração.
