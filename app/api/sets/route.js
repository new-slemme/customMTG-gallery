import { NextResponse } from 'next/server';
import { getAllSets } from '@/lib/sets';

export async function GET() {
  return NextResponse.json(getAllSets());
}
