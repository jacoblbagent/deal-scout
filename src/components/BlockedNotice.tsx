interface Props {
  reason: string
  query: string
}

export default function BlockedNotice({ reason, query }: Props) {
  return (
    <section className="blocked" role="alert">
      <div className="blocked__icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M5.6 5.6l12.8 12.8" />
        </svg>
      </div>
      <div>
        <h2 className="blocked__title">Search blocked</h2>
        <p className="blocked__reason">{reason}</p>
        <p className="blocked__query">
          You asked for: <code>{query}</code>
        </p>
      </div>
    </section>
  )
}
