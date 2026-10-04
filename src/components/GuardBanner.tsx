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
        <strong>Filter is locked.</strong> Deal Scout searches everyday products but will never search for{' '}
        <em>weapons, illegal drugs, adult content, tobacco or alcohol</em>, or anything harmful, hazardous or
        illicit. The rules live in server code and cannot be changed from this page or by any prompt.
      </p>
    </aside>
  )
}
