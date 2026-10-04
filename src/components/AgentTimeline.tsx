import type { Step } from '../types'

const ICON: Record<Step['status'], string> = { ok: '✓', blocked: '✕', error: '!' }

export default function AgentTimeline({ steps }: { steps: Step[] }) {
  if (!steps.length) return null
  return (
    <ol className="timeline">
      {steps.map((s, i) => (
        <li key={i} className={`timeline__item timeline__item--${s.status}`}>
          <span className="timeline__dot">{ICON[s.status]}</span>
          <span className="timeline__step">{s.step}</span>
          <span className="timeline__detail">{s.detail}</span>
        </li>
      ))}
    </ol>
  )
}
