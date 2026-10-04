import type { Category } from '../types'

interface Props {
  categories: Category[]
  onPick: (term: string) => void
  disabled?: boolean
}

export default function CategoryChips({ categories, onPick, disabled }: Props) {
  return (
    <div className="chips" role="group" aria-label="Allowed above-the-belt categories">
      <span className="chips__label">Allowed:</span>
      {categories.map((c) => (
        <button
          key={c.code}
          type="button"
          className="chips__chip"
          onClick={() => onPick(c.example)}
          disabled={disabled}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
