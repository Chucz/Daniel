# EduScale

Aplicativo de controle de faltas e substituições, publicado no Netlify.

## Banco Supabase

Projeto: `tdxlwvjqlgcofqqdlois` (EduScale, São Paulo).
Painel: https://supabase.com/dashboard/project/tdxlwvjqlgcofqqdlois

As funções do servidor usam `SUPABASE_DATABASE_URL` quando configurada. Sem essa variável, continuam usando o banco Netlify existente para permitir a transição sem interromper o site. A tela de login e as variáveis `AUTH_USER` e `AUTH_PASSWORD` permanecem iguais.

O esquema inicial está em `db/supabase-setup.sql`, aplicado ao projeto pelo gerenciamento de migrações do Supabase. Não execute novamente em um banco já configurado. As tabelas têm RLS e não permitem acesso pelas chaves públicas. O papel `eduscale_app` permite somente as operações usadas pelo servidor.

### Ativação no Netlify

1. Se existem grades no banco Netlify, exporte e importe a tabela `schedules` preservando os IDs antes da troca. Não é necessário transferir sessões: os usuários entrarão novamente. Não exclua o banco antigo durante a transição.
2. No SQL Editor do Supabase, habilite o login do papel com uma senha forte e exclusiva: `ALTER ROLE eduscale_app LOGIN PASSWORD 'SUA_SENHA_FORTE';`. Faça isso diretamente no painel, sem salvar a senha em arquivos SQL ou no GitHub.
3. No painel **Connect**, copie a URI de **Transaction pooler**. Use `eduscale_app.tdxlwvjqlgcofqqdlois` como usuário, sua senha codificada para URL, o host mostrado no painel e a porta `6543`.
4. No Netlify, configure `SUPABASE_DATABASE_URL` como variável secreta disponível para **Functions** no ambiente de produção. Não use variáveis públicas. Mantenha `AUTH_USER` e `AUTH_PASSWORD`.
5. Faça um novo deploy. Entre, salve uma alteração na grade e recarregue para conferir a persistência no Supabase. As grades continuam vinculadas ao navegador pelo cookie atual.

O driver usa TLS e uma conexão por instância. Prepared statements estão desativados para compatibilidade com o Transaction pooler.

Documentação: https://supabase.com/docs/guides/database/drizzle
