import { NextResponse } from 'next/server';
import { getSetCards } from '@/lib/sets';

export async function GET(_req, { params }) {
  const cards = getSetCards(params.set_slug);
  if (!cards) return NextResponse.json({ error: 'Set not found' }, { status: 404 });
  return NextResponse.json(cards);
}
