import type { Category, SearchResponse } from './types'

/** The only field the API accepts is `query`. Nothing else is sent. */
export async function search(query: string, signal?: AbortSignal): Promise<SearchResponse> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal
  })
  const data = (await res.json()) as SearchResponse
  if (!res.ok && !data.steps) {
    throw new Error((data as { reason?: string }).reason || `Request failed (${res.status})`)
  }
  return data
}

export async function getCatalog(): Promise<Category[]> {
  const res = await fetch('/api/catalog')
  const data = (await res.json()) as { categories: Category[] }
  return data.categories
}

export function formatUSD(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
