import { FormEvent } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  loading: boolean
}

export default function SearchBar({ value, onChange, onSubmit, loading }: Props) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!loading && value.trim()) onSubmit()
  }
  return (
    <form className="search" onSubmit={submit} role="search">
      <input
        className="search__input"
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={80}
        placeholder="e.g. air fryer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Product to search for"
      />
      <button className="search__btn" type="submit" disabled={loading || !value.trim()}>
        {loading ? 'Searching…' : 'Find best deal'}
      </button>
    </form>
  )
}
