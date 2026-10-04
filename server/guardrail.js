/**
 * guardrail.js — CONTENT SAFETY FILTER
 * =====================================================================
 * Deal Scout is a general product price-finder. It will search for almost
 * anything a normal person would shop for — EXCEPT weapons, illegal drugs,
 * adult/sexual content, and anything harmful, hazardous or illicit.
 *
 * This module is the single source of truth for what is blocked. It is:
 *
 *   1. HARD-CODED  — the prohibited-term tables live in this file and nowhere
 *      else. No database row, config flag, request parameter or prompt can
 *      add to, remove from, or disable them.
 *   2. SERVER-SIDE  — it runs in Node, outside the model. The LLM is a second
 *      opinion for phrasing the tables miss; it can only ADD blocks, never
 *      remove one. Its verdict is re-validated by this code.
 *   3. MONOTONIC   — a code match ALWAYS blocks. Nothing the model says, and
 *      nothing in the request, can un-block it. That is the "cannot be
 *      overwritten" guarantee.
 *
 * `POST /api/search` accepts exactly one field (`query`); every other field
 * is discarded, so a caller cannot smuggle in `allowlist`, `systemPrompt`,
 * `model` or a filter bypass.
 *
 * To change what's blocked, edit this file and redeploy. There is
 * intentionally no runtime switch.
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
 * PROHIBITED GROUPS. Each term is either a string, or a `[term, excludeSrc]`
 * pair where `excludeSrc` is a regex (tested against the normalised query)
 * that suppresses the match for legitimate look-alikes — e.g. "glue gun"
 * (a craft tool) vs "gun", or "wine glass" (glassware) vs "wine".
 */
export const PROHIBITED_GROUPS = [
  {
    code: 'weapons',
    label: 'weapons, ammunition or explosives',
    terms: [
      ['gun', '\\b(glue|nail|spray|caulking|caulk|paint|staple|heat|soldering|solder|rivet|stud|brad|water|squirt|nerf|toy|airsoft|paintball|bubble|foam|hot\\s+glue)\\s+guns?\\b'],
      ['guns', '\\b(glue|nail|spray|caulking|caulk|paint|staple|heat|soldering|solder|rivet|stud|brad|water|squirt|nerf|toy|airsoft|paintball|bubble|foam|hot\\s+glue)\\s+guns?\\b'],
      'firearm', 'firearms', 'handgun', 'handguns', 'pistol', 'pistols', 'revolver',
      'revolvers', 'rifle', 'rifles', 'uzi', 'glock', 'sig sauer', 'ar 15', 'ar15',
      'ak 47', 'ak47', 'assault rifle', 'machine gun', 'submachine gun',
      ['shotgun', '\\bshotgun\\s+(mic|mics|microphone|microphones)\\b'],
      'bump stock', 'lower receiver', 'ghost gun', 'high capacity magazine',
      'gun magazine', 'silencer', 'suppressor', 'ammunition', 'ammo',
      ['bullets', '\\bbullets?\\s+(journal|journals|points?)\\b'],
      'brass casings', 'armor piercing', 'hollow point', 'tracer rounds',
      'taser', 'stun gun', 'stun baton', 'pepper spray', 'mace spray',
      'brass knuckles', 'knuckle duster', 'switchblade', 'butterfly knife',
      'ballistic knife', 'gravity knife', 'dagger', 'daggers', 'machete',
      'machetes', 'sword', 'swords', 'katana', 'combat knife', 'tactical knife',
      'throwing knife', 'throwing star', 'shuriken', 'nunchaku', 'nunchucks',
      'crossbow', 'crossbows', 'grenade', 'grenades',
      ['bomb', '\\bbath\\s+bombs?\\b'],
      ['bombs', '\\bbath\\s+bombs?\\b'], 'explosive', 'explosives', 'dynamite',
      ['c4', '\\bcorvette\\b|\\bc4\\s+(transmission|transmissions|plastics?|plant|photosynthesis|model)'],
      'tnt', 'detonator',
      'blasting cap', 'flamethrower', 'missile', 'rocket launcher', 'landmine',
      'land mine'
    ]
  },
  {
    code: 'drugs',
    label: 'illegal drugs or drug paraphernalia',
    terms: [
      'cocaine', 'heroin', 'meth', 'methamphetamine', 'crystal meth', 'fentanyl',
      'opium', 'morphine', 'oxycodone', 'oxycontin', 'percocet', 'vicodin',
      'xanax', 'adderall', 'ritalin', 'valium', 'tramadol', 'suboxone', 'mdma',
      'ecstasy', 'lsd', 'psilocybin', 'magic mushrooms', 'shrooms', 'ketamine',
      'ghb', 'dmt', 'ayahuasca', 'peyote', 'anabolic steroids', 'steroids',
      'trenbolone', 'clenbuterol', 'marijuana', 'cannabis', 'ganja',
      'thc cartridge', 'thc vape', 'dab rig', 'crack pipe', 'meth pipe',
      'bong', 'bongs', 'drug paraphernalia', 'narcotics', 'illegal drugs',
      'prescription drugs', 'painkillers', 'opioids', 'syringe', 'syringes'
    ]
  },
  {
    code: 'adult',
    label: 'adult or sexual content',
    terms: [
      'porn', 'porno', 'pornography', 'xxx', 'hentai', 'erotica',
      ['nude', '\\bnude\\s+(lipstick|lip|shade|shades|heel|heels|tone|palette|leggings|bra|dress|pumps|leather)\\b'],
      'nudes', 'naked', 'sex toy', 'sex toys', 'dildo', 'dildos', 'vibrator',
      'butt plug', 'anal plug', 'fleshlight', 'masturbator', 'cock ring',
      'penis pump', 'bdsm', 'bondage kit', 'fetish', 'escort service',
      'prostitute', 'prostitution', 'strip club', 'strip clubs', 'stripper',
      'onlyfans', 'camgirl', 'webcam girls', 'adult toys', 'sex doll',
      'sex dolls', 'adult video', 'adult content', 'adult film'
    ]
  },
  {
    code: 'tobacco-alcohol',
    label: 'tobacco, vaping or alcohol',
    terms: [
      ['cigarette', '\\bcigarette\\s+(pants|trousers|jeans)\\b'],
      'cigarettes', ['cigar', '\\bcigar\\s+box\\s+guitars?\\b'], 'cigars', 'chewing tobacco', 'snuff', 'snus',
      'nicotine', 'nicotine pouch', 'vape', 'vape pen', 'vape juice',
      'e liquid', 'e cigarette', 'e cigarettes', 'juul', 'hookah', 'shisha',
      ['alcohol', '\\b(isopropyl|rubbing|ethyl|denatured)\\s+alcohol\\b|\\balcohol\\s+(wipes|swabs|pad|pads|free|marker|markers|ink)\\b'],
      ['beer', '\\bbeer\\s+(glass|glasses|mug|mugs|opener|openers|koozie|koozies|coozie|pong|tap|taps|growler|growlers|keg|kegs|fridge|cooler|paddle|making|kit)\\b'],
      ['wine', '\\bwine\\s+(glass|glasses|rack|racks|opener|openers|stopper|stoppers|decanter|decanters|cooler|coolers|aerator|carafe|charm|charms|bag|tote|making|kit|fridge|refrigerator|cellar|preserver|thermometer|holder)\\b'],
      ['whiskey', '\\bwhisk(e)?y\\s+(glass|glasses|stone|stones|decanter|barrel|barrels|making|flask)\\b'],
      ['whisky', '\\bwhisk(e)?y\\s+(glass|glasses|stone|stones|decanter|barrel|barrels|making|flask)\\b'],
      ['vodka', '\\bvodka\\s+(glass|glasses|decanter|making|kit)\\b'],
      ['champagne', '\\bchampagne\\s+(flute|flutes|glass|glasses|bucket|stopper|charm|charms)\\b'],
      'tequila', 'liquor', 'bourbon', 'absinthe', 'hard seltzer', 'malt liquor'
    ]
  },
  {
    code: 'hazmat',
    label: 'hazardous, toxic or explosive materials',
    terms: [
      'poison', 'arsenic', 'cyanide', 'ricin', 'anthrax', 'sarin', 'nerve agent',
      'mustard gas', 'chlorine gas', 'radioactive', 'uranium', 'plutonium',
      'radium', 'asbestos', 'liquid mercury', 'sulfuric acid', 'hydrochloric acid',
      'nitric acid', 'hydrofluoric acid', 'lye', 'ammonium nitrate',
      'explosive precursor', 'thermite', 'napalm', 'white phosphorus',
      'tear gas', 'cs gas'
    ]
  },
  {
    code: 'illicit',
    label: 'counterfeit, stolen or fraudulent goods',
    terms: [
      'fake id', 'fake ids', 'counterfeit', 'counterfeits', 'counterfeit money',
      'counterfeit currency', 'fake money', 'forged documents', 'fake passport',
      'fake diploma', 'diploma mill', 'fake degree', 'stolen goods',
      'stolen credit card', 'credit card dumps', 'cvv dumps', 'carding',
      'fraud kit', 'card skimmer', 'atm skimmer', 'pirated', 'pirated software',
      'cracked software', 'keygen', 'license key generator', 'stolen data',
      'database dump'
    ]
  },
  {
    code: 'hacking',
    label: 'hacking or surveillance tools',
    terms: [
      'keylogger', 'spyware', 'stalkerware', 'ransomware', 'malware',
      'computer virus', 'hacking tool', 'hacking tools', 'ddos', 'botnet',
      'remote access trojan', 'wifi jammer', 'signal jammer', 'cell jammer',
      'gps jammer', 'spy camera', 'hidden camera', 'pen camera'
    ]
  },
  {
    code: 'wildlife',
    label: 'protected wildlife or human remains',
    terms: [
      'live animal', 'live animals', 'puppy for sale', 'kitten for sale',
      'live puppy', 'live kitten', 'ivory', 'elephant ivory', 'rhino horn',
      'tiger bone', 'pangolin', 'bear bile', 'shark fin', 'whale meat',
      'bushmeat', 'exotic animal', 'endangered species', 'protected species',
      'human remains', 'human organs', 'body parts for sale', 'human bone'
    ]
  },
  {
    code: 'hate',
    label: 'hate symbols or extremist merchandise',
    terms: [
      'swastika', 'nazi', 'neo nazi', 'neo nazis', 'white power',
      'white supremacist', 'hate symbol', 'hate symbols', 'kkk',
      'ku klux klan', 'hitler', 'third reich', 'ss uniform', 'terrorist flag',
      'isis flag', 'extremist merchandise'
    ]
  }
]

// Pre-compiled matchers (built once at module load; immutable thereafter).
const COMPILED = PROHIBITED_GROUPS.map((g) => ({
  code: g.code,
  label: g.label,
  matchers: g.terms.map((entry) => {
    const [term, excludeSrc] = Array.isArray(entry) ? entry : [entry, null]
    return {
      raw: term,
      re: termRe(normalize(term)),
      exclude: excludeSrc ? new RegExp(excludeSrc) : null
    }
  })
}))

/** First prohibited match in the normalised text, or null. */
function findProhibited(q) {
  for (const group of COMPILED) {
    for (const m of group.matchers) {
      if (m.re.test(q) && !(m.exclude && m.exclude.test(q))) {
        return { group, term: m.raw }
      }
    }
  }
  return null
}

/**
 * Deterministic screen. Runs before any model call and is authoritative.
 * @returns {{allowed:boolean, reason:string, code:string|null, label:string|null, matchedTerm:string|null}}
 */
export function screen(rawQuery) {
  const q = normalize(rawQuery)

  if (!q) {
    return { allowed: false, reason: 'Enter a product to search for.', code: null, label: null, matchedTerm: null }
  }
  if (q.length > 80) {
    return { allowed: false, reason: 'Query is too long.', code: null, label: null, matchedTerm: null }
  }

  const hit = findProhibited(q)
  if (hit) {
    return {
      allowed: false,
      reason: `"${hit.term}" is a prohibited item (${hit.group.label}). This tool won't search for it.`,
      code: hit.group.code,
      label: hit.group.label,
      matchedTerm: hit.term
    }
  }

  return { allowed: true, reason: 'No prohibited term detected.', code: null, label: null, matchedTerm: null }
}

/**
 * Second gate on the LLM's safety verdict. The model may only ADD a block:
 *  - code block  -> block, always (unchanged).
 *  - model "unsafe" with a known category -> block.
 *  - otherwise -> allow.
 * A model saying "safe" can never un-block a code match.
 */
export function validateSafety(rawQuery, verdict) {
  const codeVerdict = screen(rawQuery)
  if (!codeVerdict.allowed) return codeVerdict

  const known = new Set([...PROHIBITED_GROUPS.map((g) => g.code), 'other'])
  if (verdict?.safe === false && known.has(verdict?.category)) {
    const label =
      PROHIBITED_GROUPS.find((g) => g.code === verdict.category)?.label ??
      'a prohibited item'
    return {
      allowed: false,
      reason: `This request looks like ${label}. This tool won't search for it.`,
      code: verdict.category,
      label,
      matchedTerm: null
    }
  }

  return codeVerdict
}

/** Defence in depth: screen a listing title before it is shown. */
export function offerTitleSafe(title) {
  const q = normalize(title)
  if (!q) return false
  return findProhibited(q) === null
}

/** Example searches for the UI. */
export const EXAMPLE_QUERIES = [
  'air fryer',
  'running shoes',
  'wireless earbuds',
  'cast iron skillet',
  'cotton polo shirt',
  'yoga mat',
  'espresso machine',
  'dash cam'
]

/** For GET /api/catalog — examples plus the blocked categories. */
export function catalog() {
  return {
    examples: EXAMPLE_QUERIES,
    prohibited: PROHIBITED_GROUPS.map(({ code, label }) => ({ code, label }))
  }
}
