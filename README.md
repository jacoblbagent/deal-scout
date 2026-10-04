# Deal Scout

A React web UI backed by an **agent that finds the best US deal on a product you type in** — restricted to a strict, non-overridable set of common **above-the-belt** items. Powered by a **free Nemotron model** via OpenRouter.

**Live link:** none yet — this app needs the Node backend running (it holds the API key and the guardrail), so it isn't a static GitHub Pages site. Run it locally with the steps below.

---

## What it does

1. You type a product (e.g. *"mens cotton polo shirt"*).
2. The server runs it through a **hard-coded guardrail** that only allows common above-the-belt items — tops, layers, headwear, neckwear and upper-body accessories.
3. If allowed, a free **NVIDIA Nemotron** model (via OpenRouter, with live web search) finds current offers from **US retailers only**, in USD.
4. Offers are post-filtered and ranked server-side; the cheapest is shown as the **best deal**.

Anything at or below the belt line, and anything that isn't an above-the-belt item, is refused before any model call.

---

## The guardrail (the important part)

The restriction "only common above-the-belt items" lives in **`server/guardrail.js`** and cannot be changed from the UI, from a request, or from a prompt:

- **Hard-coded tables.** The allowed categories and denied terms are constants in that one file. There is no database row, no config flag and no runtime switch.
- **Server-side.** It runs in Node, outside the model. The LLM is only a tie-breaker for words the tables don't recognise, and its answer is re-validated by the same deterministic code.
- **Fail-closed.** A query must *positively* match an allowed category to proceed; a deny match always wins over an allow match.
- **One input field.** `POST /api/search` accepts exactly one field (`query`). Extra fields like `allowlist`, `systemPrompt` or `model` are ignored, so a caller cannot smuggle in an override.
- **Defence in depth.** Result titles are re-screened against the same deny table, so a bad offer can't slip through even if the model returns it.

Denied by design: pants, shorts, skirts, dresses, belts, shoes, socks, underwear, swimwear, and non-apparel goods. See `DENIED_TERMS` / `OUT_OF_SCOPE_TERMS` in `server/guardrail.js`.

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

## Cost note

The **Nemotron model itself is free** (OpenRouter `:free` tier). The live price data comes from OpenRouter's **web-search plugin**, which is billed by OpenRouter at roughly **$0.004–0.007 per search**. Set `WEB_SEARCH=false` to run 100% free — results will then be empty unless you wire up a shopping API. There is no free keyless US shopping API, which is why the grounded web search is used.

## API

- `GET /api/health` — liveness, active model, whether web search is on
- `GET /api/catalog` — the allowed above-the-belt categories (used for the UI chips)
- `POST /api/search` `{ "query": "..." }` — returns `{ blocked, verdict, offers, best, steps, meta }`

## Layout

```
server/
  index.js        Express API + US-only + post-filters + ranking
  guardrail.js    THE immutable above-the-belt allow/deny tables
  agent.js        free-Nemotron calls (classify + grounded US deal research)
src/
  App.tsx         main UI
  components/     SearchBar, CategoryChips, AgentTimeline, DealCard, ...
  styles/main.scss
```
