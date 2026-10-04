/**
 * index.js — Deal Scout API server.
 *
 * Endpoints:
 *   GET  /api/health   — liveness + which model is active
 *   GET  /api/catalog  — the allowed above-the-belt categories (for UI chips)
 *   POST /api/search   — { query }  ->  verdict + ranked US deals
 *
 * The /api/search handler accepts exactly ONE field. Any other field is
 * ignored, so a caller cannot pass an allowlist, a system prompt, a model
 * override or a guardrail bypass. The guardrail runs before any model call
 * and re-validates anything the model says afterwards.
 */

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { screen, validateSafety, offerTitleSafe, catalog } from './guardrail.js'
import { safetyCheck, research, webSearchEnabled, activeModel } from './agent.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '16kb' }))

const PORT = process.env.PORT || 3033
const API_KEY = process.env.OPENROUTER_API_KEY

/** US-only gate for result URLs. */
const US_RETAILERS = [
  'amazon.com', 'walmart.com', 'target.com', 'bestbuy.com', 'ebay.com', 'etsy.com',
  'macys.com', 'nordstrom.com', 'kohls.com', 'gap.com', 'oldnavy.com', 'uniqlo.com',
  'zara.com', 'hm.com', 'landsend.com', 'llbean.com', 'patagonia.com', 'rei.com',
  'nike.com', 'adidas.com', 'dickssportinggoods.com', 'jcpenney.com', 'tjmaxx.com',
  'marshalls.com', 'backcountry.com', 'thenorthface.com', 'columbia.com',
  'carhartt.com', 'levi.com', 'hanes.com', 'fruit.com', 'ralphlauren.com',
  'uspoloassn.com', 'tommy.com', 'underarmour.com', 'puma.com', 'newbalance.com',
  'footlocker.com', 'academy.com', 'basspro.com', 'cabelas.com', 'samsclub.com',
  'costco.com', 'shopdisney.com', 'wrangler.com', 'dockers.com', 'brooksbrothers.com',
  'express.com', 'bananarepublic.com', 'aeropostale.com', 'hollisterco.com',
  'abercrombie.com', 'champion.com', 'lululemon.com', 'eddiebauer.com', 'sierra.com',
  'zappos.com', 'nordstromrack.com', 'shopbop.com', 'overstock.com', 'wayfair.com',
  'kohls.com', 'meijer.com', 'scheels.com', 'dunhamssports.com', 'ssense.com',
  'farfetch.com', 'revolve.com', 'asos.com', 'boohoo.com', 'shein.com'
]
const FOREIGN_TLDS = new Set([
  'uk', 'ca', 'au', 'nz', 'de', 'fr', 'it', 'es', 'nl', 'be', 'se', 'no', 'dk',
  'fi', 'ie', 'in', 'jp', 'cn', 'kr', 'br', 'mx', 'ru', 'pl', 'pt', 'gr', 'ch',
  'at', 'za', 'sg', 'hk', 'tw', 'ae', 'sa', 'tr', 'il', 'ar', 'cl', 'pe', 'th',
  'my', 'id', 'ph', 'vn', 'pk', 'bd', 'eg', 'ng', 'ke'
])
const OK_TLDS = new Set(['com', 'us', 'org', 'net', 'shop', 'store'])

// Deal aggregators and social sites — they aren't the merchant, so a price
// shown there can't be bought there. Drop them so every offer is merchant-direct.
const NON_MERCHANT = [
  'slickdeals.net', 'dealnews.com', 'bradsdeals.com', 'reddit.com', 'youtube.com',
  'pinterest.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'twitter.com',
  'x.com', 'medium.com', 'blogspot.com', 'wordpress.com', 'quora.com'
]

function isUSListing(url) {
  let host
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  if (NON_MERCHANT.some((d) => host === d || host.endsWith('.' + d))) return false
  if (US_RETAILERS.some((d) => host === d || host.endsWith('.' + d))) return true
  const tld = host.split('.').pop()
  if (FOREIGN_TLDS.has(tld)) return false
  return OK_TLDS.has(tld)
}

function parsePrice(v) {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string') {
    const m = v.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
    if (m) return parseFloat(m[1])
  }
  return null
}

function parseShipping(v) {
  if (v == null) return null
  if (typeof v === 'number') return v
  const s = String(v).toLowerCase()
  if (s.includes('free')) return 0
  const m = s.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : null
}

function normalizeUrl(url) {
  try {
    const u = new URL(url)
    u.hash = ''
    u.search = ''
    // Collapse www / www2 / m subdomains so "www.hm.com" and "www2.hm.com"
    // resolve to the same listing key.
    u.hostname = u.hostname.replace(/^(www\d*|m)\./i, '')
    return u.toString().replace(/\/+$/, '').toLowerCase()
  } catch {
    return url.toLowerCase().replace(/[#?].*$/, '').replace(/\/+$/, '')
  }
}

/** Strip markdown links and bare URLs the model likes to leave in `notes`. */
function cleanNotes(v) {
  return String(v ?? '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 200)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: activeModel(), webSearch: webSearchEnabled() })
})

app.get('/api/catalog', (_req, res) => {
  res.json(catalog())
})

app.post('/api/search', async (req, res) => {
  const started = Date.now()
  const steps = []

  // ---- Gate 1: input is exactly one string field. Everything else ignored. ----
  const rawQuery = typeof req.body?.query === 'string' ? req.body.query : ''
  const query = rawQuery.trim().slice(0, 80)

  steps.push({ step: 'intake', status: 'ok', detail: query ? `Query "${query}"` : 'No query supplied' })

  if (!query) {
    return res.status(400).json({ ok: false, blocked: true, reason: 'Enter a product to search for.', steps })
  }

  // ---- Gate 2: deterministic content screen (no model involved). ----
  let verdict = screen(query)
  steps.push({
    step: 'filter',
    status: verdict.allowed ? 'ok' : 'blocked',
    detail: verdict.allowed ? 'No prohibited term detected' : verdict.reason
  })

  // ---- Gate 3: model safety pass. Only ever ADDS a block; the model can
  // never un-block something the code tables caught. Fail-closed: if the
  // check can't run, we don't search. ----
  if (verdict.allowed) {
    try {
      const guess = await safetyCheck({ query, model: activeModel(), apiKey: API_KEY })
      const confirmed = validateSafety(query, guess)
      verdict = confirmed
      steps.push({
        step: 'safety',
        status: confirmed.allowed ? 'ok' : 'blocked',
        detail: confirmed.allowed ? 'Cleared by safety classifier' : confirmed.reason
      })
    } catch (err) {
      verdict = {
        allowed: false,
        reason: "Couldn't verify this request is safe (safety check unavailable). Please try again.",
        code: null,
        label: null,
        matchedTerm: null
      }
      steps.push({ step: 'safety', status: 'error', detail: err.message })
    }
  }

  if (!verdict.allowed) {
    return res.json({
      ok: true,
      blocked: true,
      query,
      reason: verdict.reason,
      verdict,
      steps,
      offers: [],
      best: null,
      meta: { usOnly: true, model: activeModel(), elapsedMs: Date.now() - started }
    })
  }

  // ---- Gate 3: research the approved product (US-only, web-grounded). ----
  let researchResult
  try {
    researchResult = await research({
      query,
      label: verdict.label,
      model: activeModel(),
      apiKey: API_KEY,
      webSearch: webSearchEnabled()
    })
    steps.push({
      step: 'search',
      status: 'ok',
      detail: `${researchResult.data?.offers?.length ?? 0} raw offers · ${researchResult.citations.length} sources`
    })
  } catch (err) {
    steps.push({ step: 'search', status: 'error', detail: err.message })
    return res.status(502).json({
      ok: false,
      blocked: false,
      query,
      reason: `The agent couldn't reach the model: ${err.message}`,
      verdict,
      steps,
      offers: [],
      best: null
    })
  }

  // ---- Gate 4: deterministic post-filters (US only, in-scope titles, valid). ----
  const seen = new Set()
  const offers = []
  for (const raw of researchResult.data?.offers ?? []) {
    const url = typeof raw?.url === 'string' ? raw.url : ''
    const price = parsePrice(raw?.price)
    const title = String(raw?.title ?? '').slice(0, 160)
    const currency = String(raw?.currency ?? 'USD').toUpperCase()
    if (!url.startsWith('http')) continue
    if (currency !== 'USD') continue
    if (price == null || price <= 0 || price > 20000) continue
    if (!isUSListing(url)) continue
    if (!offerTitleSafe(`${title} ${raw?.retailer ?? ''}`)) continue
    const key = normalizeUrl(url)
    // Secondary key: same retailer + same title + same price is the same
    // listing even if the URL differs (e.g. two storefront hosts).
    const altKey = `${String(raw?.retailer ?? '').toLowerCase()}|${title.toLowerCase()}|${price}`
    if (seen.has(key) || seen.has(altKey)) continue
    seen.add(key)
    seen.add(altKey)
    const shipping = parseShipping(raw?.shipping)
    offers.push({
      retailer: String(raw?.retailer ?? 'Retailer').slice(0, 60),
      title: title || 'Listing',
      price,
      currency: 'USD',
      url,
      condition: String(raw?.condition ?? 'new').toLowerCase(),
      shipping,
      effectivePrice: price + (shipping ?? 0),
      notes: cleanNotes(raw?.notes)
    })
  }
  offers.sort((a, b) => a.effectivePrice - b.effectivePrice)

  // The model's prose can name a deal our US/merchant filter dropped, which
  // would leave the headline pointing at an offer that isn't in the list.
  // Keep the model's summary only when it actually refers to the winner;
  // otherwise state the winner factually.
  const winner = offers[0] ?? null
  const modelSummary = String(researchResult.data?.summary ?? '').trim()
  const summary = winner
    ? modelSummary && modelSummary.toLowerCase().includes(winner.retailer.toLowerCase())
      ? modelSummary
      : `${winner.title} at ${winner.retailer} — $${winner.price.toFixed(2)}`
    : ''

  const dropped = (researchResult.data?.offers?.length ?? 0) - offers.length
  steps.push({
    step: 'rank',
    status: 'ok',
    detail: `${offers.length} US offers kept${dropped > 0 ? ` · ${dropped} dropped (non-US or out-of-scope)` : ''}`
  })

  res.json({
    ok: true,
    blocked: false,
    query,
    verdict,
    product: researchResult.data?.product ?? query,
    summary,
    offers,
    best: winner,
    citations: researchResult.citations,
    steps,
    meta: {
      usOnly: true,
      webSearch: webSearchEnabled(),
      model: researchResult.model,
      usage: researchResult.usage,
      elapsedMs: Date.now() - started
    }
  })
})

// API fallback — anything unmatched under /api is a real 404 (registered
// before the SPA wildcard so API misses never return HTML).
app.use('/api', (_req, res) => res.status(404).json({ ok: false, reason: 'Not found' }))

// In production (`npm run build` then `npm start`) the Express server also
// serves the built React app, so the whole thing runs on one port.
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

app.listen(PORT, () => {
  console.log(`Deal Scout API on http://localhost:${PORT}  ·  model=${activeModel()}  ·  webSearch=${webSearchEnabled()}`)
  if (!API_KEY) console.warn('WARNING: OPENROUTER_API_KEY is not set — copy .env.example to .env')
})
