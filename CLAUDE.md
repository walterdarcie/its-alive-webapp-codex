# it's alive webapp — Claude Code Guide

## Documentação do Projeto (LEIA ANTES DE COMEÇAR)

> **OBRIGATÓRIO:** A pasta [`docs/`](docs/) contém a documentação canônica deste projeto. Antes de iniciar **qualquer** tarefa (implementação, refactor, debug, revisão), leia os arquivos relevantes abaixo. Não assuma comportamento a partir do código sem antes consultar a doc correspondente — ela descreve regras de negócio, decisões e contratos que não são óbvios pelo código.

### Arquivos da pasta `docs/`

| Documento | Conteúdo | Quando ler |
|---|---|---|
| [docs/architecture.md](docs/architecture.md) | Stack, diagrama de sistema, fluxos de auth/wallet/posts, variáveis de ambiente, convenções de arquivos, regras de produção | Sempre antes de mexer em estrutura, env, build ou fluxos transversais |
| [docs/database.md](docs/database.md) | Schema completo das tabelas, RLS, índices, triggers, migrações, Storage bucket | Antes de qualquer alteração de schema, query, RLS ou bucket |
| [docs/api.md](docs/api.md) | Todos os endpoints com request/response shapes | Antes de criar/alterar rotas em `app/api/**` ou consumi-las no client |
| [docs/components.md](docs/components.md) | Árvore de componentes, props, estado, helpers de `lib/` | Antes de criar/alterar componentes em `app/ui/**` ou helpers em `lib/**` |
| [docs/features.md](docs/features.md) | Inventário de features, user flows, regras de negócio | Antes de tocar em qualquer feature de produto |
| [docs/search.md](docs/search.md) | Pipeline da busca, integração com setlist.fm, rate limits, MBIDs canônicos, troubleshooting | Antes de mexer em busca, sugestões, integração com setlist.fm ou Ticketmaster |
| [docs/security.md](docs/security.md) | Revisão de segurança pré-lançamento: vulnerabilidades encontradas, corrigidas e postura geral | Antes de mexer em auth, sessão, validação de input, CORS, headers, segredos |

### Atualizar a documentação ao final de cada tarefa (OBRIGATÓRIO)

Toda tarefa que altere **comportamento, estrutura, contrato ou decisão de projeto** deve terminar com a atualização dos arquivos de `docs/` afetados — na mesma sessão, antes de considerar a tarefa concluída. Isso inclui:

- Novos endpoints, mudanças de payload/response, novos códigos de erro → `docs/api.md`
- Mudanças de schema, novas tabelas/colunas, alteração de RLS/índices/triggers, novas migrações → `docs/database.md`
- Novos componentes, mudança de props, novos helpers em `lib/` → `docs/components.md`
- Nova feature, mudança de user flow ou regra de negócio → `docs/features.md`
- Mudança em variáveis de ambiente, build, deploy, convenções de arquivo → `docs/architecture.md`
- Mudanças no pipeline da busca, integrações de música/shows, rate limits → `docs/search.md`
- Qualquer mudança com impacto em segurança (auth, validação, headers, segredos, dependências sensíveis) → `docs/security.md`

Se a doc estiver desatualizada em relação ao que você acabou de mudar, **corrija** — não deixe pendente. Se uma seção ficou obsoleta, remova-a. Se for uma mudança puramente cosmética/estilística sem impacto nas docs, isso pode ser dito explicitamente no final da resposta.

## Project Overview

Next.js 14 (App Router) + React 18 + TypeScript 5. Dark-mode only, Portuguese-language music event app. No CSS framework, no component library — vanilla CSS with CSS variables throughout.

---

## Design Tokens

All tokens live in `app/globals.css` inside `:root`. Use them by name — never use raw hex or px values when a token exists.

### Color Tokens
```css
/* Backgrounds */
--bg-primary: #140016
--bg-secondary: #1f0322
--bg-tertiary: #2a0730

/* Surfaces */
--surface-card: #162a52
--surface-card-hover: #1c3566
--surface-soft: #101c3a

/* Pink / primary brand */
--gradient-a: #ff2f92
--gradient-b: #ff7a5c
--pink: #ff2f92
--pink-light: #ff6fb8
--pink-dark: #b00064

/* Blue accent */
--blue-accent: #2f6bff
--blue-glow: #6ea8ff

/* Text */
--text-primary: #f5f7ff
--text-secondary: #c9cde8
--text-muted: #8f96b8

/* Neutrals */
--neutral: #47536b
--neutral-dark: #172642
```

### Spacing (8px base unit)
```css
--space-1: 8px   --space-2: 16px   --space-3: 24px   --space-4: 32px
```

### Border Radius
```css
--radius-md: 16px   --radius-lg: 24px
```

### Shadow
```css
--shadow-card: 0 14px 30px rgba(0, 0, 0, 0.32)
```

---

## Styling Rules

- **Global CSS only** — all styles go in `app/globals.css`. No CSS Modules, no Styled Components, no Tailwind.
- **camelCase class names** — `cardTitle`, `searchFieldWrap`, `iconSvg`.
- **State via compound classes** — `.ctaMain.isActive`, `.detailSheetOverlay.isClosing`, `.cardImage.hasPhoto`.
- **Fluid sizing** — use `clamp()` and `min()` for responsive values, not breakpoint hacks.
  ```css
  font-size: clamp(28px, 5.8vw, 42px);
  width: min(88vw, 300px);
  ```
- **Breakpoints** — mobile-first. `max-width: 720px` for tablet/mobile; `min-width: 900px` for desktop.
- **Motion** — always include `@media (prefers-reduced-motion: reduce)` counterpart for animations.

---

## Component Patterns

### File Location
Page-level client components: `app/ui/<page-name>-client.tsx`
Shared utilities/helpers: `lib/*.ts`
Brand SVG components: `lib/brand-svg.tsx`

### Component Convention
- All interactive page components use `"use client"` directive at the top.
- Helper components (icons, sub-sections) are defined as local functions within the same file unless they are shared.
- No default exports — use named exports.

### Icon Pattern
Icons are inline SVG function components. Always use `fill="currentColor"` so they inherit the parent `color` property. Add `aria-hidden="true"` and `className="iconSvg"` to every icon.

```tsx
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="iconSvg">
      <path d="..." fill="currentColor" />
    </svg>
  );
}
```

Standard icon sizes: `22×22` (UI icons), `18×18` (inline/small), `40×40` (avatar).

### Button Pattern
Primary CTA uses `.ctaMain` class. Add `.isSmall` or `.isActive` modifiers as needed:
```tsx
<button className={`ctaMain${isActive ? " isActive" : ""}`}>...</button>
```

### Card Pattern
```tsx
<article className="card">
  <div className={`cardImage${imageUrl ? " hasPhoto" : ""}`}>...</div>
  <div className="cardBody">...</div>
</article>
```

### Image Pattern
Always use Next.js `<Image>` component for static and remote images. Remote images are allowed via wildcard in `next.config.mjs`.

---

## Figma Integration Rules

When implementing a design from Figma, follow this mapping:

### Color Mapping
| Figma | CSS variable |
|---|---|
| Background (darkest) | `var(--bg-primary)` |
| Background (mid) | `var(--bg-secondary)` |
| Card surface | `var(--surface-card)` |
| Primary pink / gradient | `var(--gradient-a)` → `var(--gradient-b)` |
| Body text | `var(--text-primary)` |
| Secondary text | `var(--text-secondary)` |
| Muted text | `var(--text-muted)` |

### Gradient Usage
Active/highlight elements use the linear gradient:
```css
background: linear-gradient(90deg, var(--gradient-a), var(--gradient-b));
```

### Typography
Font: `Work Sans` (400 regular, 700 bold — no other weights).
Font sizes are set per-component; there is no global type scale. Tight negative tracking on headings:
```css
letter-spacing: -0.02em;  /* section titles */
letter-spacing: -0.03em;  /* card titles */
```

### Spacing
Map Figma spacing to the 8px grid. Prefer token variables for standard increments; use explicit px only for one-off values.

### Icons from Figma
If a Figma component contains a new icon:
1. Extract the SVG path data.
2. Create a local inline SVG function in the consuming component file.
3. Use `fill="currentColor"`, `aria-hidden="true"`, and `className="iconSvg"`.
4. If the icon will be used in more than one file, consider adding it to `lib/brand-svg.tsx`.

---

## Project Structure (Key Paths)

```
app/
  globals.css          ← ALL styles live here
  layout.tsx           ← Root layout, font import
  ui/
    home-client.tsx
    search-page-client.tsx
    show-detail-client.tsx
    login-client.tsx
lib/
  brand-svg.tsx        ← Logo components
  show-types.ts        ← Shared TypeScript types
  show-utils.ts        ← Date/venue formatting helpers
  wallet-storage.ts    ← LocalStorage + Supabase wallet sync
  auth.ts              ← Google OAuth + Supabase auth
public/
  brand/               ← logo-default.svg, logo-icon.svg, logo-vertical.svg
```

---

## What NOT to do

- Do not introduce Tailwind, CSS Modules, or any CSS-in-JS library.
- Do not create a `components/` directory — add to `app/ui/` or extract to `lib/`.
- Do not hard-code hex colors or px spacing when a token exists.
- Do not import an icon library (heroicons, lucide, etc.) — use inline SVGs.
- Do not add a component prop for `className` overrides — scope all style changes to `globals.css`.
- Do not create `.md` documentation files unless explicitly asked.
