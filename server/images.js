/**
 * images.js — resolve a real product image for an offer.
 *
 * We never invent an image. We only ever surface a URL that actually came off
 * the retailer's own product page, via a fetch chain:
 *
 *   1. Plain fetch  — read og:image / twitter:image / JSON-LD `image` from the
 *      page HTML. Cheap, and enough for retailers that don't bot-wall.
 *   2. Headless     — if the plain fetch is blocked (Walmart, Amazon, Home
 *      Depot, Dick's and H&M all serve bot walls to plain requests), drive a
 *      real headless Chromium at the page and pull the image out of the live
 *      DOM. Uses `playwright-core`, declared as an OPTIONAL dependency: if it
 *      or its browser binary isn't installed, this step is skipped and the
 *      offer simply has no image.
 *
 * Results are cached in memory, and the browser is reused across the offers of
 * a single search rather than launched per offer.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const cache = new Map() // pageUrl -> { src, ts }

// Offers we bother with headless. Keeps a search bounded when many retailers
// are bot-walled.
const HEADLESS_LIMIT = 3

/** Pull an image URL out of raw HTML. Returns an absolute URL or null. */
function extractFromHtml(html, base) {
  const abs = (u) => {
    try {
      return new URL(String(u).replace(/&amp;/g, '&').trim(), base).toString()
    } catch {
      return null
    }
  }
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image:secure_url["']/i,
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /"image"\s*:\s*"([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) {
      const src = abs(m[1])
      if (src) return src
    }
  }
  return null
}

async function plainExtract(pageUrl) {
  try {
    const res = await fetch(pageUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    if (!res.ok) return null
    if (!(res.headers.get('content-type') || '').includes('text/html')) return null
    const html = (await res.text()).slice(0, 500000)
    return extractFromHtml(html, pageUrl)
  } catch {
    return null
  }
}

let chromiumMod // undefined = not tried, false = unavailable, else the module

async function getChromium() {
  if (chromiumMod !== undefined) return chromiumMod
  try {
    const mod = await import('playwright-core')
    chromiumMod = mod.chromium ?? false
  } catch {
    chromiumMod = false
  }
  return chromiumMod
}

/** Headless extraction for a batch of page URLs, sharing one browser. */
async function headlessExtractBatch(pageUrls) {
  const chromium = await getChromium()
  if (!chromium || pageUrls.length === 0) return new Map()

  const out = new Map()
  let browser
  try {
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
    const ctx = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1400, height: 1000 },
      locale: 'en-US'
    })
    await Promise.all(
      pageUrls.map(async (pageUrl) => {
        const page = await ctx.newPage()
        try {
          // Let images load — on retailers without an og:image (Amazon) the
          // live <img> elements ARE the only source. Fonts/media are skipped.
          await page.route('**/*', (route) =>
            ['font', 'media'].includes(route.request().resourceType())
              ? route.abort()
              : route.continue()
          )
          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 25000 })
          await page.waitForTimeout(3500)
          const src = await page.evaluate((base) => {
            const abs = (u) => {
              try {
                return new URL(u, base).toString()
              } catch {
                return null
              }
            }
            const pick = (sel, attr) => {
              const el = document.querySelector(sel)
              return el ? el.getAttribute(attr) : null
            }
            const meta =
              pick('meta[property="og:image:secure_url"]', 'content') ||
              pick('meta[property="og:image"]', 'content') ||
              pick('meta[name="twitter:image"]', 'content')
            if (meta) return abs(meta)

            // Main product photo: gallery containers first (Amazon uses
            // #landingImage; other platforms have their own hooks).
            const gallerySelectors = [
              '#landingImage', '#imgTagWrapperId img', '#main-image',
              'img[itemprop="image"]', '[data-test="product-image"] img',
              '.product-image img', '.product__media img', '.pdp-main-image img',
              '.product-gallery img', '.gallery-image img', 'figure img'
            ]
            for (const sel of gallerySelectors) {
              const el = document.querySelector(sel)
              const u = el && (el.getAttribute('src') || el.getAttribute('data-src'))
              if (u && !/sprite|logo|icon|placeholder/i.test(u)) return abs(u)
            }

            // Fall back to the first reasonably large image in DOM order —
            // product photos generally precede lifestyle/A+ content.
            const first = [...document.querySelectorAll('img')].find((i) => {
              const u = i.currentSrc || i.src
              return u && (i.naturalWidth || 0) >= 250 && (i.naturalHeight || 0) >= 250 &&
                !/sprite|logo|icon|placeholder/i.test(u)
            })
            return first ? abs(first.currentSrc || first.src) : null
          }, pageUrl)
          if (src) out.set(pageUrl, src)
        } catch {
          /* bot wall or timeout — no image for this offer */
        } finally {
          await page.close().catch(() => {})
        }
      })
    )
  } catch {
    return out
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
  return out
}

/**
 * Resolve images for a set of offer URLs.
 * @returns {Promise<Map<string,string|null>>} pageUrl -> image URL or null
 */
export async function resolveImages(pageUrls) {
  const unique = [...new Set(pageUrls)]
  const result = new Map()
  const needHeadless = []

  for (const pageUrl of unique) {
    const hit = cache.get(pageUrl)
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      result.set(pageUrl, hit.src)
      continue
    }
    result.set(pageUrl, null) // default: no image
    needHeadless.push(pageUrl)
  }

  // Stage 1 — cheap plain fetches, in parallel.
  const plain = await Promise.all(
    needHeadless.map(async (u) => [u, await plainExtract(u)])
  )
  const stillMissing = []
  for (const [u, src] of plain) {
    if (src) result.set(u, src)
    else stillMissing.push(u)
  }

  // Stage 2 — headless for whatever is left, capped.
  if (stillMissing.length) {
    const batch = stillMissing.slice(0, HEADLESS_LIMIT)
    const headless = await headlessExtractBatch(batch)
    for (const [u, src] of headless) if (src) result.set(u, src)
  }

  for (const u of unique) cache.set(u, { src: result.get(u) ?? null, ts: Date.now() })
  return result
}
