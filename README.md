# Deal Scout

A React web UI backed by an **agent that finds the best US deal on a product you type in** — with a hard, non-overridable block on weapons, illegal drugs, adult content, and anything harmful, hazardous or illicit. Powered by a **free Nemotron model** via OpenRouter.

**Live link:** none yet — this app needs the Node backend running (it holds the API key and the filter), so it isn't a static GitHub Pages site. Run it locally with the steps below.

---

## What it does

1. You type a product (e.g. *"air fryer"*, *"running shoes"*, *"cotton polo shirt"*).
2. The server runs it through a **content filter**: a hard-coded prohibited-term screen in code, then a model safety classifier that catches slang and paraphrase.
3. If cleared, a free **NVIDIA Nemotron** model (via OpenRouter, with live web search) finds current offers from **US retailers only**, in USD.
4. Offers are post-filtered and ranked server-side; the cheapest is shown as the **best deal**.

Anything prohibited is refused before any shopping search runs.

---

## The filter (the important part)

Deal Scout is a general shopping agent — it searches for everyday products. What it will **never** search for lives in **`server/guardrail.js`** and cannot be changed from the UI, from a request, or from a prompt:

- **Hard-coded tables.** The prohibited-term groups are constants in that one file. There is no database row, no config flag and no runtime switch.
- **Server-side.** It runs in Node, outside the model. The classifier is a second opinion only.
- **Monotonic.** A code match ALWAYS blocks. Nothing the model says can un-block it — the model can only *add* a block, never remove one. A model verdict of "safe" is re-validated by the same deterministic code.
- **Fail-closed.** If the safety classifier can't run, the request is not searched.
- **One input field.** `POST /api/search` accepts exactly one field (`query`). Extra fields like `allowlist`, `systemPrompt` or `model` are ignored, so a caller cannot smuggle in a bypass.
- **Defence in depth.** Result titles are re-screened against the same tables, so a prohibited listing can't slip through even if the model returns it.

**Blocked:** weapons, ammunition and explosives · illegal drugs and drug paraphernalia · adult or sexual content · tobacco, vaping and alcohol · hazardous, toxic and explosive materials · counterfeit, stolen and fraudulent goods · hacking and surveillance tools · protected wildlife and human remains · hate symbols and extremist merchandise.

**Not blocked (deliberate):** legitimate look-alikes — glue guns, nail guns, shotgun microphones, wine glasses, beer mugs, bullet journals, bath bombs, kitchen knives, isopropyl alcohol, cigarette pants, cigar-box guitars. Each has an explicit exclusion in the tables, and the list was tested in both directions (43/43 prohibited queries blocked, 42/42 ordinary products allowed).

---

## Product images

Each offer carries a real product image, sourced from the retailer's own page — never invented or searched for.

- **Stage 1 (cheap):** a server-side fetch of the offer URL, reading `og:image` / `twitter:image` / JSON-LD `image`. Covers Target, Adobe/Scene7-backed stores, and Shopify-style shops.
- **Stage 2 (headless):** Walmart, Amazon, Home Depot, Dick's and H&M all serve bot walls to plain requests, so when stage 1 is blocked a real headless Chromium visits the page and pulls the main product photo out of the live DOM (Amazon needs this — it has no `og:image`).
- **Proxy:** retailer CDNs reject hotlinks and often send no CORS headers, so images are streamed through `GET /api/image?u=…`. That endpoint is SSRF-guarded: https only, no private/loopback hosts, and the host must be a US retailer or a known image CDN.
- **No image found → a neutral placeholder tile.** We never substitute an unrelated photo.

`playwright-core` is an **optional dependency**. To enable stage 2:

```bash
npm i playwright-core
npx playwright-core install chromium
```

Without it the app still runs; offers that stage 1 can't resolve just show the placeholder. Bot-walled retailers mean coverage is typically **50–80%** of offers per search — a paid image API would close the gap.

---

## Stack

- **Frontend:** React 18 + Vite + TypeScript + SCSS (`src/`)
- **Backend:** Node + Express (ESM, no build step) (`server/`)
- **Model:** free Nemotron on OpenRouter (`nvidia/nemotron-3-super-120b-a12b:free` by default)
- **Ports:** web `5183` (dev) · API `3033`

## Quick start

```bash
cd ~/Code/deal-scout
npm install
cp .env.example .env      # then paste your OpenRouter key
npm run dev               # server + Vite dev server together
# open http://localhost:5183
```

Production-style single-port run:

```bash
npm run build   # type-check + build the SPA into dist/
npm start       # Express serves the API and the built app on :3033
```

Requires Node 18+ (developed on Node 22).

## Environment

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | **Required.** Server-side only — never sent to the browser. |
| `DEAL_MODEL` | Any OpenRouter Nemotron id. Default `nvidia/nemotron-3-super-120b-a12b:free`. |
| `REASONING_EFFORT` | `low` (default) / `medium` / `high`. Nemotron is a reasoning model. |
| `WEB_SEARCH` | `true` (default) to enable OpenRouter's web-search plugin. |
| `PORT` | API port. Default `3033`. |

## Cost and latency notes

- The **Nemotron model itself is free** (OpenRouter `:free` tier). Live price data comes from OpenRouter's **web-search plugin**, billed by OpenRouter at roughly **$0.004–0.007 per search**. Set `WEB_SEARCH=false` to run 100% free — results will then be empty unless you wire up a shopping API. There is no free keyless US shopping API, which is why the grounded web search is used.
- A search typically takes **10–70 seconds**: the safety pass is ~1–2s, but the free reasoning model + live web fetch dominate, and the length of its thinking varies run to run.

## API

- `GET /api/health` — liveness, active model, whether web search is on
- `GET /api/catalog` — example searches + the blocked categories (used by the UI)
- `GET /api/image?u=<imageUrl>` — SSRF-guarded image proxy for retailer CDNs
- `POST /api/search` `{ "query": "..." }` — returns `{ blocked, verdict, offers, best, steps, meta }`

## Layout

```
server/
  index.js        Express API + US-only + merchant-direct + post-filters + ranking
  guardrail.js    THE immutable prohibited-term tables + screen/validate
  agent.js        free-Nemotron calls (safety classifier + grounded US deal research)
  images.js       real product-image resolution (plain fetch -> headless fallback)
src/
  App.tsx         main UI
  components/     SearchBar, ExampleChips, AgentTimeline, DealCard, ...
  styles/main.scss
```
