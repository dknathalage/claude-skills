---
name: ssr-frontend
description: "[LEGACY — Go SSR stack only. The default stack is now TypeScript on Bun + React Router v7 + real shadcn/ui; do NOT use this for new work.] Build a server-rendered UI for the legacy Go+Fly pkg/ui design system (shadcn tokens + html/template + HTMX/Alpine). Applies ONLY to the still-running Go property-offers app."
---

# SSR Frontend with `pkg/ui`

Our Go + Fly SaaS UIs are **server-rendered** and get their look, components, and
interactivity from one shared module: **`github.com/dknathalage/pkg/ui`** (released
at v0.5.0+). It ports the **shadcn/ui** design language to Go `html/template`, ships
a built Tailwind stylesheet, and self-hosts HTMX + Alpine — so a product imports the
UI in one line instead of re-authoring CSS. This skill is how you build with it.

**Announce:** "Using the ssr-frontend skill to build on pkg/ui."

**Default stack (do not deviate without reason):** Go 1.26 · `net/http` + `html/template`
server rendering · `pkg/ui` for look + components + interactivity · HTMX for partials /
app-like nav / SSE · Alpine for local UI state · Tailwind (standalone CLI, no Node runtime)
built into `pkg/ui` · Fly.io single machine. Do **not** reach for React/Next/Astro or a
client-side router — that was explicitly rejected (it splits the app in two and duplicates
the server-side auth/privacy projection across a client boundary).

## Wire it up once (per product)

```go
import "github.com/dknathalage/pkg/ui"

// Parse the component library once at startup; reuse the set. Add your own
// page templates into a clone of it so {{template "ui/button" ...}} resolves.
base, err := ui.Templates()            // *template.Template + funcmap (dict, attrs, raw, darkModeScript, toggleAttrs)
pages := template.Must(base.Clone())
template.Must(pages.ParseFS(appTemplates, "templates/*.tmpl"))

// Serve the self-hosted htmx/alpine. Mount at /ui/.
mux.Handle("/ui/", ui.StaticHandler())  // GET /ui/htmx.js, /ui/alpine.js (long cache, traversal-safe → 404)

// Serve YOUR product's compiled CSS at /ui/app.css — an exact pattern that
// OVERRIDES the /ui/ subtree in Go 1.22+ ServeMux. (See the CSS note below —
// do NOT just rely on ui.StaticHandler's /ui/app.css: that CSS was purged
// against pkg/ui's own components only and is missing your classes.)
mux.HandleFunc("GET /ui/app.css", productCSSHandler)  // embeds your own build
```

`ui.StaticHandler()` serves `/ui/{app.css,htmx.js,alpine.js}` (traversal-safe; anything
else 404s), but its `app.css` only contains the classes **pkg/ui's own components** use.
The `appshell` links `/ui/app.css` and loads the scripts; you override the CSS route with
your product build (next section).

## CRITICAL: compile your product's own CSS (don't rely on pkg/ui's embedded app.css)

Tailwind purges to only the classes found in the **scanned content**. pkg/ui's
`dist/app.css` was built scanning pkg/ui's components only — so the moment your templates
use any utility those components don't (layout `grid`/`max-w-*`/`space-y-*`, status colors
`bg-green-100`, `text-3xl`, `uppercase`, `dark:` variants, …), those classes are **absent
and your pages render unstyled in production** (tests that only assert class *strings in the
HTML* will not catch this — the class is in the markup but has no CSS rule). This bit
`property-offers` and would bite every product.

**So each product compiles its own CSS** with the standalone Tailwind CLI (see the
`tailwind-standalone-fly-build` pattern), scanning **both** its own templates **and the
vendored pkg/ui components**, reusing pkg/ui's shadcn tokens + theme:

```
# product/web/css/tailwind.config.js
content: ["../templates/**/*.tmpl",
          "../../../vendor/github.com/dknathalage/pkg/ui/components/**/*.tmpl"]
# theme.extend.colors + borderRadius + safelist: copy from pkg/ui's tailwind.config.js
# tailwind.input.css: @tailwind base/components/utilities + the shadcn :root/.dark tokens
#   (copied from pkg/ui/tokens.css), tokens OUTSIDE @layer base
```

Commit the built `app.css`, `go:embed` it, serve it at `/ui/app.css` (overriding
pkg/ui's), and rebuild it in the Docker builder stage before `go build`. Keep using
`ui.StaticHandler()` for the htmx/alpine JS. A Go test should assert the built CSS contains
a few of your non-pkg/ui classes (e.g. `grid`, `bg-green-100`) to guard the purge.

## Scaffold a page

Every full page renders through `ui/appshell` (the frame: `<html>`, `{{darkModeScript}}`
first in `<head>` for no-FOUC dark mode, the stylesheet, `hx-boost` nav, a `nav` slot, and
a `{{block "content" .}}` region). Define your page body as the `content` block:

```gotemplate
{{define "content"}}
  {{template "ui/card" (dict
     "title" "Create listing"
     "content" (raw "<form ...>...</form>"))}}
{{end}}
{{template "ui/appshell" (dict "title" "New listing" "nav" (raw "..."))}}
```

Render with `pages.ExecuteTemplate(w, "ui/appshell", data)` after defining `content` in the
same set, **or** compose smaller components with `ui.RenderComponent("ui/button", data)` for
one-offs (note: `RenderComponent` re-parses every call — fine for a one-off, but for a
hot path call `ui.Templates()` once and reuse the set).

## Component contract (read this — it's the #1 gotcha)

Components are invoked as `{{template "ui/<name>" (dict "key" value ...)}}` and take a
`map[string]any`. The data types matter because `html/template` escapes by context:

- **Text fields** (`label`, `title`, `description`) are **auto-escaped** — pass plain
  strings, safe for untrusted/user data.
- **`attrs`** (extra HTML attributes like `hx-post`, `data-*`, `id`, `required`) **must be
  `ui.Attrs("...")`** (a `template.HTMLAttr`). A plain string renders as `ZgotmplZ` and
  silently vanishes.
- **Slots / raw markup** (`slot`, `content`, `header`, `footer`, `trigger`, nested renders)
  **must be `ui.Raw("...")`** (a `template.HTML`).
- **`variant` / `size`**: unknown or empty → the default variant (never a broken class attr).

Component inventory: `ui/button` (variant default|secondary|outline|ghost|destructive|link ×
size sm|default|lg|icon), `ui/card`, `ui/input`, `ui/label`, `ui/badge`, `ui/alert`,
`ui/appshell`, `ui/nav`, `ui/dialog`, `ui/dropdown`, `ui/tabs`, `ui/table`, `ui/toast`,
`ui/separator`, `ui/avatar`. The interactive ones (dialog/dropdown/tabs/toast) carry Alpine
directives for local state — no custom JS needed.

## Theming / dark mode

Tokens are shadcn CSS variables (`--background --foreground --primary --muted --border --ring
--radius`, …) for light `:root` and `.dark`. A product re-skins by overriding a few vars in its
own CSS after `/ui/app.css`. Dark mode is a `.dark` class on `<html>`, applied **before first
paint** by `{{darkModeScript}}` (reads `localStorage` then `prefers-color-scheme`); the toggle
button uses `{{toggleAttrs}}`. `appshell` wires both — don't hand-roll a competing toggle.

## The load-bearing rule: partials render through the same server auth

HTMX makes the browser request HTML fragments. **A partial endpoint is just another
server-rendered view and MUST go through the exact same auth + data-visibility projection as
the full page.** Never return data to a partial that the viewer's role couldn't see on the full
page; never trust a client-supplied role/flag. If the product has a privacy/projection layer
(e.g. `Project(viewer, …)`), the partial handler calls it too, with the viewer derived from the
session server-side. Interactivity must not become a hole around the security model.

## Accessibility floor (non-negotiable)

Keyboard `:focus-visible` rings (built into the components), `prefers-reduced-motion` respected,
semantic markup, dialog `aria-modal` + label, tabs/dropdown ARIA roles, sufficient contrast.
The components ship these; don't strip them when composing.

## Design principles (shadcn-derived)

Neutral, calm, content-first. One accent (`--primary`). Consistent radius and spacing from the
tokens. Hierarchy through weight and space, not boxes-in-boxes. Motion only to show what changed
(an open, a reveal) — not decorative fade-ins on every section. Lean on `pkg/ui` components so
the look stays consistent across products; if you find yourself writing one-off CSS, either add
a variant to `pkg/ui` (so every product gets it) or reconsider. For genuinely novel one-page
visual work, the `frontend-design` skill's principles still apply — but product chrome uses
`pkg/ui`.

## Extending the system

A new component or variant that generalizes belongs **in `pkg/ui`**, not in one product — add it
there (TDD, literal shadcn class strings so Tailwind's content-scan keeps them, rebuild
`ui/dist/app.css` via `ui/build.sh`), release a pkg minor, and every product inherits it. See the
patterns: `pkg-ui-design-system`, `htmx-sse-ssr`, `tailwind-standalone-fly-build`.
