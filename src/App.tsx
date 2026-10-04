import { useEffect, useRef, useState } from 'react'
import { getCatalog, search } from './api'
import type { Category, SearchResponse } from './types'
import GuardBanner from './components/GuardBanner'
import SearchBar from './components/SearchBar'
import CategoryChips from './components/CategoryChips'
import AgentTimeline from './components/AgentTimeline'
import DealCard from './components/DealCard'
import BlockedNotice from './components/BlockedNotice'

export default function App() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    getCatalog().then(setCategories).catch(() => setCategories([]))
  }, [])

  async function run(q: string) {
    const term = q.trim()
    if (!term || loading) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await search(term, controller.signal)
      setResult(data)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function pickExample(example: string) {
    setQuery(example)
    run(example)
  }

  // `best` is offers[0] after server-side sorting, but it arrives as its own
  // deserialized object — compare by position, not by reference, or the top
  // offer renders twice.
  const best = result?.offers?.[0] ?? null
  const others = result?.offers?.slice(1) ?? []

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__brand">
          <span className="masthead__mark">DS</span>
          <div>
            <h1 className="masthead__title">Deal Scout</h1>
            <p className="masthead__sub">Best US price on any above-the-belt item</p>
          </div>
        </div>
        <span className="masthead__badge">🇺🇸 US only</span>
      </header>

      <GuardBanner />

      <section className="console">
        <SearchBar value={query} onChange={setQuery} onSubmit={() => run(query)} loading={loading} />
        <CategoryChips categories={categories} onPick={pickExample} disabled={loading} />
      </section>

      {loading && (
        <section className="working">
          <span className="spinner" aria-hidden="true" />
          <span>Agent is checking the guardrail, then scanning US retailers…</span>
        </section>
      )}

      {error && (
        <section className="error" role="alert">
          {error}
        </section>
      )}

      {result && (
        <section className="output">
          <AgentTimeline steps={result.steps} />

          {result.blocked ? (
            <BlockedNotice reason={result.reason ?? 'Not allowed.'} query={result.query} />
          ) : result.offers.length === 0 ? (
            <section className="empty">
              <h2>No US deals confirmed</h2>
              <p>
                The agent approved <strong>{result.product}</strong> ({result.verdict?.label}) but couldn't
                confirm a current US listing with a verifiable price. Try a broader term.
              </p>
            </section>
          ) : (
            <>
              {result.summary && <p className="summary">{result.summary}</p>}
              {best && <DealCard offer={best} best />}
              {others.length > 0 && (
                <>
                  <h2 className="others__title">Other US offers</h2>
                  <div className="others">
                    {others.map((o) => (
                      <DealCard key={o.url} offer={o} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {result.meta && (
            <footer className="meta">
              <span>{result.meta.model}</span>
              <span>·</span>
              <span>{result.meta.webSearch ? 'live web search' : 'no web search'}</span>
              <span>·</span>
              <span>{result.meta.usOnly ? 'US retailers only' : 'worldwide'}</span>
              {result.meta.elapsedMs != null && (
                <>
                  <span>·</span>
                  <span>{(result.meta.elapsedMs / 1000).toFixed(1)}s</span>
                </>
              )}
            </footer>
          )}
        </section>
      )}
    </div>
  )
}
