import type { Offer } from '../types'
import { formatUSD } from '../api'

export default function DealCard({ offer, best }: { offer: Offer; best?: boolean }) {
  const shipping =
    offer.shipping === 0
      ? 'Free shipping'
      : offer.shipping != null
        ? `+${formatUSD(offer.shipping)} shipping`
        : ''
  const initial = (offer.retailer || '?').trim().charAt(0).toUpperCase()

  return (
    <article className={`deal${best ? ' deal--best' : ''}`}>
      <div className="deal__head">
        {best && <span className="deal__ribbon">Best deal</span>}
        <span className="deal__retailer">{offer.retailer}</span>
      </div>

      <div className="deal__main">
        <div className="deal__media">
          {/* Fallback sits behind; if the image 404s it hides and reveals this. */}
          <span className="deal__mediaFallback" aria-hidden="true">
            {initial}
          </span>
          {offer.image && (
            <img
              className="deal__img"
              src={`/api/image?u=${encodeURIComponent(offer.image)}`}
              alt={offer.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
        </div>

        <div className="deal__info">
          <h3 className="deal__title">{offer.title}</h3>
          <div className="deal__priceRow">
            <span className="deal__price">{formatUSD(offer.price)}</span>
            {shipping && <span className="deal__ship">{shipping}</span>}
          </div>
          {offer.shipping != null && offer.shipping > 0 && (
            <div className="deal__effective">≈ {formatUSD(offer.effectivePrice)} delivered</div>
          )}
          {offer.notes && <p className="deal__notes">{offer.notes}</p>}
          <div className="deal__foot">
            <span className="deal__cond">{offer.condition}</span>
            <a className="deal__link" href={offer.url} target="_blank" rel="noopener noreferrer nofollow">
              View at {offer.retailer} ↗
            </a>
          </div>
        </div>
      </div>
    </article>
  )
}
