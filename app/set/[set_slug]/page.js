'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import CardModal from '@/components/CardModal';

export default function SetPage({ params }) {
  const [cards, setCards] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch(`/api/sets/${encodeURIComponent(params.set_slug)}/cards`)
      .then((r) => r.json())
      .then((data) => setCards(Array.isArray(data) ? data : []));
  }, [params.set_slug]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => c.name.toLowerCase().includes(q));
  }, [cards, query]);

  return (
    <div>
      <p><Link href="/">← Back to sets</Link></p>
      <h1>{params.set_slug}</h1>
      <input placeholder="Search cards by name" value={query} onChange={(e) => setQuery(e.target.value)} />
      <p>{filtered.length} cards</p>
      <div className="grid">
        {filtered.map((card) => (
          <button key={card.id} className="card" onClick={() => setSelected(card)}>
            <img src={card.image_url || '/placeholder-card.svg'} alt={card.name} />
            <h3>{card.name}</h3>
            <p>{card.type}</p>
          </button>
        ))}
      </div>
      {selected && <CardModal card={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
