import { ArrowRight } from 'lucide-react';

export default function QuoteCard({ quote, onClick }: { quote: any; onClick: () => void }) {
  return (
    <div className="quote-card" onClick={onClick}>
      <div className="quote-ref">{quote.reference_code}</div>
      <div className="quote-route">
        {quote.origin} <ArrowRight size={16} color="#6366f1" /> {quote.destination}
      </div>
      <div className="quote-details">
        <span>{quote.cargo_description} · {quote.weight_kg}kg</span>
        <span className="price">{quote.proposed_rate} {quote.currency}</span>
      </div>
    </div>
  );
}