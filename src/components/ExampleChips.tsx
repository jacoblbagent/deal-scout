import type { ProhibitedGroup } from '../types'

interface Props {
  examples: string[]
  prohibited: ProhibitedGroup[]
  onPick: (term: string) => void
  disabled?: boolean
}

export default function ExampleChips({ examples, prohibited, onPick, disabled }: Props) {
  return (
    <div className="chipsWrap">
      <div className="chips" role="group" aria-label="Example searches">
        <span className="chips__label">Try:</span>
        {examples.map((e) => (
          <button key={e} type="button" className="chips__chip" onClick={() => onPick(e)} disabled={disabled}>
            {e}
          </button>
        ))}
      </div>
      {prohibited.length > 0 && (
        <p className="chips__blocked">
          <span>Blocked:</span> {prohibited.map((p) => p.label).join(' · ')}
        </p>
      )}
    </div>
  )
}
