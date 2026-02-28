import { NextResponse } from 'next/server';
import { getCard } from '@/lib/sets';

export async function GET(_req, { params }) {
  const card = getCard(params.set_slug, params.card_id);
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  return NextResponse.json(card);
}
