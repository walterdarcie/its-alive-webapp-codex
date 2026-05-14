# Revisão de Segurança — it's alive

_Revisão realizada em 2026-05-14 antes do lançamento público._

---

## Postura Geral

O projeto usa Supabase com RLS habilitado em todas as tabelas, autenticação via `supabase.auth.getUser()` no servidor (nunca no cliente), e o anon key corretamente limitado por policies. A base é sólida; as vulnerabilidades encontradas são pontuais.

---

## Vulnerabilidades Encontradas e Corrigidas

### 1. Auth bypass ativo em produção via variável pública — **CRÍTICO** ✅ Corrigido

**Arquivo:** `lib/auth.ts`

**Problema:** A função `isAuthBypassEnabled()` aceitava `NEXT_PUBLIC_BYPASS_AUTH=1` como gatilho de bypass. Por ser uma variável `NEXT_PUBLIC_`, ela fica embutida no bundle do cliente e, se fosse acidentalmente definida no Vercel em produção, autenticaria qualquer requisição como um usuário fantasma sem exigir login real.

**Correção:** Removida a variante `NEXT_PUBLIC_BYPASS_AUTH`. O bypass agora só funciona quando `NODE_ENV !== "production"` e `BYPASS_AUTH=1` está definida — nunca em produção.

```ts
// antes
return process.env.BYPASS_AUTH === "1" || process.env.NEXT_PUBLIC_BYPASS_AUTH === "1";

// depois
if (process.env.NODE_ENV === "production") return false;
return process.env.BYPASS_AUTH === "1";
```

---

### 2. `photoUrl` aceito sem validação — **ALTA** ✅ Corrigido

**Arquivo:** `app/api/posts/[showId]/route.ts`

**Problema:** O campo `photoUrl` enviado no body do POST era gravado diretamente no banco sem verificar se a URL aponta para o bucket correto do Supabase Storage. Um usuário autenticado poderia armazenar qualquer URL arbitrária (tracking pixel, conteúdo malicioso, foto de outro bucket) como `photo_url`.

**Correção:** Validação adicionada: a URL deve ser uma URL válida **e** começar com `{SUPABASE_URL}/storage/v1/object/public/post-photos/`.

---

### 3. Detalhes de erro do banco expostos na API — **MÉDIA** ✅ Corrigido

**Arquivos:** `app/api/wallet/route.ts`, `app/api/posts/[showId]/route.ts`

**Problema:** Erros do Supabase eram repassados diretamente ao cliente via `message: error.message`. Mensagens do Postgres podem revelar nomes de tabelas, colunas, constraints e tipos internos.

**Exemplo:**
```json
{ "error": "Failed to load wallet", "message": "invalid input syntax for type uuid: \"bypass-user\"" }
```

**Correção:** Erros são agora logados no servidor (`console.error`) e o cliente recebe apenas a mensagem genérica sem o `message` interno.

---

### 4. Injeção de `</script>` no bloco JSON-LD — **MÉDIA** ✅ Corrigido

**Arquivo:** `app/show/[id]/page.tsx`

**Problema:** O JSON-LD de dados estruturados era inserido via `dangerouslySetInnerHTML` usando `JSON.stringify` puro. O `JSON.stringify` não escapa o caractere `<`, então um nome de artista contendo `</script>` (vindo da API do Setlist.fm) poderia fechar prematuramente a tag `<script>` e abrir um vetor de XSS.

**Correção:** `.replace(/</g, "\\u003c")` aplicado após o stringify. Parsers JSON entendem `<` normalmente; o HTML não o interpreta como tag.

---

### 5. Política de deleção ausente no Storage `post-photos` — **MÉDIA** ✅ Corrigido

**Arquivo:** `supabase/migrations/20260514120001_post_photos_delete_policy.sql`

**Problema:** O bucket `post-photos` tinha policy apenas para upload e leitura. Sem policy de deleção, usuários não conseguiam excluir suas próprias fotos via API de Storage, gerando arquivos órfãos no bucket sempre que um post era deletado.

**Correção:** Nova migration adicionada com policy de deleção restrita ao próprio usuário:
```sql
create policy "post_photos delete own" on storage.objects
  for delete using (
    bucket_id = 'post-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

---

## Achados Sem Vulnerabilidade Imediata (Boas Práticas)

### RLS — Configuração Correta ✅

Todas as tabelas têm RLS habilitado com policies que garantem isolamento por `auth.uid() = user_id`. Nenhum dado de um usuário é acessível por outro via API Supabase.

- `wallet_entries`: SELECT/INSERT/UPDATE/DELETE restritos ao dono.
- `show_posts`: SELECT público (posts são públicos), INSERT/DELETE restritos ao dono.
- `post_likes`: SELECT/INSERT/DELETE restritos ao dono.
- Storage `post-photos`: upload e deleção restritos ao dono da pasta; leitura pública (comportamento esperado para fotos de posts sociais).

### Autenticação Server-Side ✅

Todas as rotas de API usam `supabase.auth.getUser()` no servidor — nunca confiam em dados enviados pelo cliente para identificar o usuário. O middleware também chama `getUser()` para manter a sessão atualizada.

### Cookies de Sessão ✅

O Supabase SSR configura cookies com `HttpOnly` e `SameSite=Lax` por padrão, o que mitiga ataques CSRF clássicos.

### Sem Uso do Service Role Key no Código ✅

A variável `SUPABASE_SERVICE_ROLE_KEY` aparece apenas no `.env.example` (para operações de CLI). Nenhuma rota de API a utiliza — todo acesso passa pelo anon key com RLS.

### XSS nas Páginas React ✅

Conteúdo de usuário (nome de posts, nomes de usuários) é renderizado via JSX, que escapa HTML automaticamente. Nenhum `dangerouslySetInnerHTML` recebe dados controlados pelo usuário — o único uso é no JSON-LD (corrigido acima).

### Redirecionamento Open Redirect Mitigado ✅

Em `app/auth/callback/route.ts`, o parâmetro `next` é validado com regex `/^\/(?!\/)./` antes do redirect, evitando redirecionamento para domínios externos.

---

## Itens Pendentes (Não Bloqueantes para o Lançamento)

| Item | Prioridade | Observação |
|------|-----------|------------|
| Rate limiting nas rotas de POST | Baixa | Supabase tem limites de banco, mas sem throttle no nível HTTP. Recomendado pós-lançamento via Vercel Edge ou Upstash. |
| Limpeza periódica de arquivos órfãos no Storage | Baixa | Mesmo com a nova policy de delete, arquivos podem ficar órfãos se a deleção do post falhar antes da deleção do arquivo. Uma função CRON de limpeza é recomendada no futuro. |
