# Tom de Voz — it's alive

> Como o produto fala com quem foi lá.

---

## O que somos

O **it's alive** é uma carteira de emoções ao vivo. Guardamos memórias — não apenas dados de shows. Cada show na carteira representa um momento real: a roupa que você usou, o cheiro de cigarros no ar, a música que fez você chorar. O produto precisa falar como alguém que entende isso.

---

## Princípios de comunicação

### 1. Emoção antes de função
A interface não faz upload de shows — ela **guarda memórias**. Não salva na conta — **fica disponível em qualquer lugar**. Cada decisão de texto começa pela experiência emocional, não pela operação técnica.

| ❌ Evitar | ✅ Preferir |
|---|---|
| Salvar show | Guardar memória |
| Publicar post | Guardar memória |
| Sincronizado com Google + Supabase | Seus shows ficam salvos em qualquer dispositivo |
| Falha ao publicar | Não conseguimos guardar sua memória |
| Imagem do show (placeholder) | Nome do artista (fallback natural) |

### 2. Fala como amigo, não como sistema
Erros acontecem. Quando algo dá errado, o produto não se exime com jargão técnico. Ele reconhece, empatiza, sugere.

| ❌ Evitar | ✅ Preferir |
|---|---|
| Falha ao buscar shows | Não conseguimos buscar os shows agora |
| Erro interno temporário | Algo deu errado por aqui. Tenta de novo em instantes |
| Muitas buscas em sequência | Muitas buscas seguidas. Respira um segundo e tenta de novo |
| Falha no retorno do login | Algo deu errado no login. Aguarda um segundo e tenta de novo |

### 3. Presença, não instrução
O produto pressupõe que o usuário **esteve lá**. Textos de estado vazio não ensinam a usar o produto — convidam a reviver.

| ❌ Evitar | ✅ Preferir |
|---|---|
| Nenhum relato ainda. Seja o primeiro a compartilhar! | Ninguém escreveu ainda. Você foi lá — conta como foi! |
| O que você achou do show? | Como foi estar lá? Conta como você se sentiu... |
| Nenhum show passado marcado | Nenhum show passado guardado ainda |

### 4. Concisão com calor
Sem tutoriais em linha de ajuda. Textos de dica são curtos e diretos, mas nunca frios.

| ❌ Evitar | ✅ Preferir |
|---|---|
| Busque por artista, ou combine com cidade, país e ano. Vírgulas ajudam, mas não são obrigatórias. | Artista, cidade, ano — escreva como lembrar. |
| Fim dos resultados (47). | Isso é tudo — 47 shows encontrados. |

### 5. Loading humanizado
Estados de carregamento falam do que está sendo buscado, não do processo técnico.

| ❌ Evitar | ✅ Preferir |
|---|---|
| Carregando setlist... | Buscando as músicas... |
| Carregando relatos... | Carregando memórias... |
| Carregando show... | Carregando... |
| Conectando... | Conectando... *(OK — é breve e claro)* |

---

## Tom por contexto

### Landing / Login
**Tom:** inspiracional, sensorial, íntimo.

A landing é o primeiro ponto de contato. Precisa capturar a emoção do show ao vivo antes de qualquer ação. Usa segunda pessoa, tempo presente, verbos de sentimento.

> "Você estava lá. Nunca esqueça."
> "Entre para guardar suas memórias e acessá-las de qualquer lugar."

### Busca
**Tom:** curioso, orientado, descontraído.

A busca é exploração. O usuário está relembrando ou antecipando. Não há urgência — há descoberta.

> "Por onde você começa?"
> "Artista, cidade, ano — escreva como lembrar."

### Detalhe do show
**Tom:** presente, memorialístico, respeitoso com a emoção.

O detalhe do show é o coração do produto. Cada elemento reflete que este show aconteceu (ou vai acontecer) de verdade.

Botão principal: **EU FUI!** / **EU VOU!** — primeira pessoa, exclamação, identidade.
Setlist: exibe o nome do artista quando não há foto (o artista é o coração, não "Imagem do show").

### Feed social ("Quem foi")
**Tom:** comunidade, não comentários. Íntimo, presente, convidativo.

O feed é onde pessoas que estiveram no mesmo show se encontram. O título "Quem foi" remete a pertencimento. O placeholder do post convida a sentir, não a avaliar.

> "Como foi estar lá? Conta como você se sentiu..."
> "Ninguém escreveu ainda. Você foi lá — conta como foi!"

### Carteira (home)
**Tom:** pessoal, celebratório, informativo sem ser burocrático.

A home é o álbum de memórias do usuário. Seções com primeira pessoa reforçam posse emocional.

- Próximos shows: **"Eu vou!"**
- Shows passados: **"Eu fui!"**
- Estado offline: "Seus shows estão salvos aqui. A sincronização volta assim que a conexão retornar."
- Estado sincronizado: "Tudo sincronizado. Suas memórias estão disponíveis em qualquer dispositivo."

### Erros e estados de exceção
**Tom:** honesto, próximo, sem drama técnico.

Erros não são culpa do usuário. O produto reconhece o problema, fala na primeira pessoa plural ("não conseguimos"), e oferece uma saída clara.

Fórmula: **[o que não deu certo] + [o que fazer agora]**

> "Não conseguimos guardar sua memória. Tente novamente."
> "Algo deu errado por aqui. Tenta novamente em instantes."

---

## Palavras do vocabulário do produto

| Usar | Evitar |
|---|---|
| guardar / guardar memória | salvar / publicar |
| memória | post / relato (dentro do feed, "memória" é preferível) |
| Quem foi | Comunidade / Feed |
| Eu fui / Eu vou | Histórico / Próximos (como rótulos de ação) |
| mostrar tudo / ver tudo | expandir / exibir mais |
| recolher | esconder / colapsar |
| tenta de novo | recarregue a página |
| carteira | perfil / biblioteca |

---

## O que nunca fazer

- **Expor termos técnicos** ao usuário: Supabase, OAuth, CDN, cache, token, endpoint.
- **Usar "placeholder"** em qualquer texto visível — substitua pelo nome do artista ou conteúdo real.
- **Textos no formato título** para ações de carregamento (`Carregando Show...`) — use frase normal minúscula.
- **Culpar o usuário** em erros: "Você digitou errado", "Input inválido". Assuma que o problema é do sistema.
- **Frases de obrigação** como "Você deve fazer login para continuar" — prefira convite: "Entre para guardar sua memória."

---

## Voz em uma frase

> O **it's alive** fala como alguém que também esteve lá — e nunca vai esquecer.
