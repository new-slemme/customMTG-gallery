'use client';
import { useEffect, useState } from 'react';

export default function CardModal({ card, onClose }) {
  const [comments, setComments] = useState([]);
  const [form, setForm] = useState({ display_name: '', rating: '', comment: '' });
  const [zoom, setZoom] = useState(false);

  async function loadComments() {
    const res = await fetch(`/api/feedback?set=${encodeURIComponent(card.set_slug)}&card_id=${encodeURIComponent(card.id)}`);
    if (res.ok) setComments(await res.json());
  }

  useEffect(() => {
    loadComments();
  }, [card.id, card.set_slug]);

  async function submit(e) {
    e.preventDefault();
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...form, set_slug: card.set_slug, card_id: card.id, card_name: card.name })
    });
    if (!res.ok) return;
    setForm({ display_name: '', rating: '', comment: '' });
    loadComments();
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modalInner" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{card.name}</h2><button onClick={onClose}>Close</button>
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 280px' }}>
            <img
              src={card.image_url || '/placeholder-card.svg'}
              alt={card.name}
              style={{ transform: zoom ? 'scale(1.8)' : 'scale(1)', transformOrigin: 'top left' }}
            />
            <button onClick={() => setZoom((z) => !z)}>{zoom ? 'Reset Zoom' : 'Zoom In'}</button>
          </div>
          <div style={{ flex: 1 }}>
            <p><strong>Mana:</strong> {card.mana || '—'}</p>
            <p><strong>Type:</strong> {card.type || '—'}</p>
            <p><strong>P/T:</strong> {card.pt || '—'}</p>
            <p><strong>Rules:</strong></p>
            <ul>{card.rules_lines.map((line, idx) => <li key={idx}>{line}</li>)}</ul>
          </div>
        </div>

        <h3>Feedback</h3>
        <form onSubmit={submit} style={{ display: 'grid', gap: '.5rem' }}>
          <input placeholder="Display name (optional)" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <select value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })}>
            <option value="">Rating (optional)</option>
            {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <textarea placeholder="Comment" maxLength={2000} required value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          <button type="submit">Post feedback</button>
        </form>

        <div style={{ marginTop: '1rem' }}>
          {comments.map((c) => (
            <div key={c.id} className="card" style={{ marginBottom: '.5rem' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{c.display_name || 'Anonymous'}</strong>
                <small>{new Date(c.created_at).toLocaleString()}</small>
              </div>
              {c.rating ? <p>Rating: {c.rating}/5</p> : null}
              <p>{c.comment}</p>
            </div>
          ))}
          {!comments.length && <p>No comments yet.</p>}
        </div>
      </div>
    </div>
  );
}
