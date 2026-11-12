# EduScale

Aplicativo de controle de faltas e substituições, publicado no Netlify.

Instalação: `npm ci`. Build: `npm run build`. Testes: `npm test`. O diretório público é `dist/`; as funções ficam em `netlify/functions`.

O sistema usa contas individuais com e-mail e senha, cookies HttpOnly e dados compartilhados da escola. A configuração e as instruções de operação, auditoria e recuperação estão em [SECURITY.md](SECURITY.md).

Configure SUPABASE_DATABASE_URL somente no ambiente das funções do Netlify, usando o papel eduscale_app do projeto Supabase. O esquema inicial é db/supabase-setup.sql; a evolução de segurança é db/security-hardening.sql. Não reaplique arquivos em um banco já configurado sem conferir as migrações.

A grade usa controle de concorrência: se outra pessoa salvar antes, baixe uma cópia local das alterações pendentes e carregue a versão atual. A autoria das novas gravações é registrada pelo servidor no histórico.
