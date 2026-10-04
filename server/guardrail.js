/**
 * guardrail.js — ABOVE-THE-BELT ENFORCEMENT
 * =====================================================================
 * This module is the single source of truth for what Deal Scout may search
 * for. It is deliberately:
 *
 *   1. HARD-CODED  — the allow/deny tables live in this file and nowhere
 *      else. There is no database row, no config flag, no request parameter
 *      and no prompt that can add to, remove from, or disable them.
 *   2. SERVER-SIDE  — it runs in Node, outside the model. The LLM is never
 *      asked "is this allowed?" as a first-line authority; it is only ever a
 *      tie-breaker for words the tables don't recognise, and its answer is
 *      re-validated by the same deterministic code below.
 *   3. FAIL-CLOSED  — a query must POSITIVELY match an allowed category to
 *      proceed. Anything unrecognised is refused. A deny match always wins
 *      over an allow match, in every code path.
 *
 * Nothing in the API surface can reach these tables. `POST /api/search`
 * accepts exactly one field (`query`); every other field is discarded, so a
 * caller cannot smuggle in an `allowlist`, `systemPrompt` or `model`
 * override. That is the "cannot be overwritten" guarantee.
 *
 * If you (an operator) want to change what is searchable, you edit this file
 * and redeploy. There is intentionally no runtime switch.
 */

/** Lowercase, strip punctuation, collapse whitespace. Hyphens become spaces. */
export function normalize(input) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const termRe = (term) => new RegExp(`\\b${escapeRe(term).replace(/ /g, '\\s+')}\\b`)

/**
 * ALLOWED CATEGORIES — items worn ABOVE the belt line.
 * Everything here is a top, a layer, headwear, neckwear, an upper-body
 * accessory, or an arm/hand covering. Each entry has a stable `code` the UI
 * uses for chips and labels.
 */
export const ALLOWED_CATEGORIES = [
  { code: 'tshirt',     label: 'T-Shirt / Tank',  terms: ['t-shirt', 't shirt', 'tshirt', 'tee shirt', 'tee', 'tees', 'graphic tee', 'graphic t shirt', 'tank top', 'tank', 'camisole', 'cami', 'crop top'] },
  { code: 'shirt',      label: 'Shirt / Blouse',  terms: ['dress shirt', 'button-down', 'button down', 'button-up', 'button up', 'oxford shirt', 'flannel shirt', 'flannel', 'henley', 'blouse', 'shirt'] },
  { code: 'polo',       label: 'Polo',            terms: ['polo shirt', 'polo'] },
  { code: 'sweatshirt', label: 'Hoodie / Sweatshirt', terms: ['hoodie', 'hoody', 'sweatshirt', 'sweat shirt', 'crewneck', 'crew neck', 'pullover hoodie'] },
  { code: 'sweater',    label: 'Sweater',         terms: ['sweater', 'jumper', 'cardigan', 'turtleneck', 'pullover', 'fleece pullover'] },
  { code: 'jacket',     label: 'Jacket / Coat',   terms: ['suit jacket', 'sport coat', 'denim jacket', 'rain jacket', 'bomber jacket', 'windbreaker', 'parka', 'blazer', 'overcoat', 'trench coat', 'jacket', 'coat'] },
  { code: 'vest',       label: 'Vest',            terms: ['vest', 'gilet', 'waistcoat'] },
  { code: 'hat',        label: 'Hat / Cap',       terms: ['baseball cap', 'trucker hat', 'bucket hat', 'sun hat', 'beanie', 'snapback', 'fedora', 'beret', 'visor', 'cap', 'hat'] },
  { code: 'headband',   label: 'Headband',        terms: ['headband', 'sweatband', 'head wrap', 'bandana', 'bandanna'] },
  { code: 'scarf',      label: 'Scarf / Neckwear', terms: ['scarf', 'scarves', 'shawl', 'neck gaiter', 'balaclava', 'snood'] },
  { code: 'tie',        label: 'Tie',             terms: ['bow tie', 'bowtie', 'necktie', 'cravat', 'tie', 'ties'] },
  { code: 'gloves',     label: 'Gloves',          terms: ['fingerless gloves', 'mittens', 'mitts', 'gloves', 'glove'] },
  { code: 'eyewear',    label: 'Eyewear',         terms: ['sunglasses', 'sunglass', 'eyeglasses', 'spectacles', 'reading glasses', 'blue light glasses', 'goggles', 'glasses'] },
  { code: 'bag',        label: 'Backpack / Bag',  terms: ['backpack', 'rucksack', 'messenger bag', 'crossbody bag', 'shoulder bag', 'fanny pack', 'sling bag', 'tote bag', 'duffel bag', 'briefcase'] },
  { code: 'jewelry',    label: 'Necklace / Earrings', terms: ['necklace', 'pendant', 'earrings', 'earring', 'studs', 'bracelet', 'bangle', 'brooch'] },
  { code: 'watch',      label: 'Watch',           terms: ['wristwatch', 'watch'] },
  { code: 'wrap',       label: 'Poncho / Cape',   terms: ['poncho', 'cape', 'serape'] }
]

/**
 * DENIED — anything worn at or below the belt line, or otherwise out of scope
 * (non-apparel goods, regulated items). A match here refuses the query
 * unconditionally, even if an allowed word is also present.
 */
export const DENIED_TERMS = [
  // Lower body / legwear
  'pants', 'pant', 'trousers', 'jeans', 'jean', 'chinos', 'slacks', 'shorts',
  'joggers', 'sweatpants', 'sweat pants', 'leggings', 'tights', 'cargo pants',
  'skirt', 'skirts', 'dress', 'dresses', 'gown', 'romper', 'jumpsuit',
  'overalls', 'pantsuit', 'culottes', 'capris',
  // Footwear
  'shoes', 'shoe', 'sneakers', 'sneaker', 'boots', 'boot', 'sandals', 'sandal',
  'flip flops', 'loafers', 'loafer', 'heels', 'high heels', 'cleats',
  'slippers', 'slipper', 'insole', 'insoles', 'shoelaces', 'shoe laces',
  // Socks / hosiery
  'socks', 'sock', 'stockings', 'pantyhose',
  // Waist / belt
  'belt', 'belts', 'suspenders', 'braces', 'garter',
  // Underwear / lingerie
  'underwear', 'boxers', 'boxer briefs', 'briefs', 'panties', 'thong', 'bra',
  'lingerie', 'trunks', 'jockstrap',
  // Swimwear
  'swimsuit', 'swim trunks', 'bikini', 'bikini bottom', 'swim shorts',
  'board shorts', 'bathing suit', 'swim briefs', 'rash guard',
  // Ankle / lower accessories
  'anklet', 'ankle bracelet', 'leg warmers'
]

/**
 * OUT-OF-SCOPE — not apparel worn above the belt at all, or goods Deal Scout
 * refuses outright. Denied for the same non-negotiable reasons as above.
 */
export const OUT_OF_SCOPE_TERMS = [
  'gun', 'firearm', 'rifle', 'pistol', 'handgun', 'ammo', 'ammunition',
  'knife', 'knives', 'explosive', 'fireworks', 'drug', 'drugs', 'cocaine',
  'heroin', 'meth', 'fentanyl', 'medication', 'prescription', 'pill',
  'alcohol', 'vodka', 'whiskey', 'beer', 'wine', 'liquor', 'cigarette',
  'cigarettes', 'vape', 'vape pen', 'tobacco', 'nicotine',
  'laptop', 'computer', 'phone', 'iphone', 'smartphone', 'tablet', 'tv',
  'television', 'sofa', 'couch', 'mattress', 'refrigerator', 'appliance',
  'car', 'truck', 'motorcycle', 'tire', 'engine', 'live animal', 'puppy',
  'kitten', 'stock', 'stocks', 'crypto', 'nft', 'lottery', 'gift card',
  'real estate', 'ammo can'
]

// Pre-compiled matchers (built once at module load; immutable thereafter).
const ALLOW_MATCHERS = ALLOWED_CATEGORIES.map((c) => ({
  code: c.code,
  label: c.label,
  terms: c.terms.map((t) => ({ raw: t, re: termRe(normalize(t)) }))
}))
const DENY_MATCHERS = [
  ...DENIED_TERMS.map((t) => ({ raw: t, kind: 'below_belt', re: termRe(normalize(t)) })),
  ...OUT_OF_SCOPE_TERMS.map((t) => ({ raw: t, kind: 'out_of_scope', re: termRe(normalize(t)) }))
]

/** Returns the longest matching allow phrase for a normalised query, or null. */
function findAllowPhrase(q) {
  let best = null
  for (const cat of ALLOW_MATCHERS) {
    for (const { raw, re } of cat.terms) {
      if (re.test(q)) {
        const n = normalize(raw)
        if (!best || n.length > best.phrase.length) {
          best = { code: cat.code, label: cat.label, phrase: n, matched: raw }
        }
      }
    }
  }
  return best
}

/** Returns the first deny match (with its kind) in the text, or null. */
function findDenyTerm(q) {
  for (const m of DENY_MATCHERS) {
    if (m.re.test(q)) return m
  }
  return null
}

/**
 * Evaluate a raw user query against the immutable tables.
 * @returns {{allowed:boolean, code:string|null, label:string|null,
 *            reason:string, matchedTerm:string|null}}
 */
export function evaluate(rawQuery) {
  const q = normalize(rawQuery)

  if (!q) {
    return { allowed: false, code: null, label: null, reason: 'Enter a product to search for.', matchedTerm: null }
  }
  if (q.length > 80) {
    return { allowed: false, code: null, label: null, reason: 'Query is too long.', matchedTerm: null }
  }

  const allow = findAllowPhrase(q)

  // Deny scan runs on the query with the matched allow phrase removed, so an
  // allow phrase that legitimately contains a denied word ("dress shirt"
  // contains "dress") doesn't false-positive. Everything else is still
  // scanned — "polo shirt and jeans" removes "polo shirt", then trips on
  // "jeans" and is refused.
  const remainder = allow ? q.replace(termRe(allow.phrase), ' ') : q
  const deny = findDenyTerm(remainder)
  if (deny) {
    const reason = deny.kind === 'below_belt'
      ? `"${deny.raw}" sits at or below the belt line, so Deal Scout won't search for it. Above-the-belt items only.`
      : `"${deny.raw}" isn't an above-the-belt item, so Deal Scout won't search for it.`
    return { allowed: false, code: null, label: null, reason, matchedTerm: deny.raw }
  }

  if (!allow) {
    return {
      allowed: false,
      code: null,
      label: null,
      reason: "Deal Scout only searches common above-the-belt items — tops, layers, headwear, neckwear and upper-body accessories. That item isn't one of them.",
      matchedTerm: null
    }
  }

  return { allowed: true, code: allow.code, label: allow.label, reason: 'Allowed above-the-belt item.', matchedTerm: allow.matched }
}

/**
 * Second gate used on LLM output. If the model proposes a category, it must be
 * a real allow code and the phrase it claims to have matched must itself pass
 * `evaluate`. An unknown or denied proposal is rejected. This is why a
 * jailbroken prompt still cannot open the guardrail: the model's answer is
 * re-checked by the same deterministic code.
 */
export function validateModelVerdict(rawQuery, verdict) {
  const codeOk = ALLOWED_CATEGORIES.some((c) => c.code === verdict?.code)
  const phraseOk = typeof verdict?.matchedTerm === 'string' && evaluate(verdict.matchedTerm).allowed
  if (verdict?.allowed === true && codeOk && phraseOk) {
    const cat = ALLOWED_CATEGORIES.find((c) => c.code === verdict.code)
    return { allowed: true, code: cat.code, label: cat.label, reason: 'Confirmed above-the-belt item.', matchedTerm: catalogTermFor(cat.code) }
  }
  // Fall back to the deterministic verdict — never trust the model over code.
  return evaluate(rawQuery)
}

function catalogTermFor(code) {
  const cat = ALLOWED_CATEGORIES.find((c) => c.code === code)
  return cat ? cat.terms[0] : code
}

/** Cheap helper for the UI's category chips. */
export function catalog() {
  return ALLOWED_CATEGORIES.map(({ code, label, terms }) => ({ code, label, example: terms[0] }))
}

/**
 * Defence in depth: screen a retailer's listing title before it is shown. Any
 * offer whose title names a denied item is dropped, even if the model returned
 * it. Keeps the results list inside the same rule as the search box.
 */
export function offerTitleAllowed(title) {
  const q = normalize(title)
  if (!q) return false
  return findDenyTerm(q) === null
}
