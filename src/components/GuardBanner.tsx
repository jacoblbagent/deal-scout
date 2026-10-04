export default function GuardBanner() {
  return (
    <aside className="guard">
      <span className="guard__lock" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
      <p className="guard__text">
        <strong>Scope is locked.</strong> Deal Scout only searches common <em>above-the-belt</em> items —
        tops, layers, headwear, neckwear and upper-body accessories. US retailers only. This rule lives in
        server code and cannot be changed from this page or by any prompt.
      </p>
    </aside>
  )
}
