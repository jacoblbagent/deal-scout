export type StepStatus = 'ok' | 'blocked' | 'error'

export interface Step {
  step: string
  status: StepStatus
  detail: string
}

export interface Offer {
  retailer: string
  title: string
  price: number
  currency: string
  url: string
  condition: string
  shipping: number | null
  effectivePrice: number
  notes: string
}

export interface Verdict {
  allowed: boolean
  code: string | null
  label: string | null
  reason: string
  matchedTerm: string | null
}

export interface Citation {
  url: string
  title: string
}

export interface SearchResponse {
  ok: boolean
  blocked: boolean
  query: string
  reason?: string
  verdict?: Verdict
  product?: string
  summary?: string
  offers: Offer[]
  best: Offer | null
  citations?: Citation[]
  steps: Step[]
  meta?: {
    usOnly?: boolean
    webSearch?: boolean
    model?: string
    elapsedMs?: number
  }
}

export interface ProhibitedGroup {
  code: string
  label: string
}

export interface Catalog {
  examples: string[]
  prohibited: ProhibitedGroup[]
}
