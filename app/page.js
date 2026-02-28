import Link from 'next/link';
import { getAllSets } from '@/lib/sets';

export default function HomePage() {
  const sets = getAllSets();
  return (
    <div>
      <h1>Custom MTG Gallery</h1>
      <p>Available sets in /sets</p>
      <ul>
        {sets.map((set) => (
          <li key={set.set_slug}>
            <Link href={`/set/${encodeURIComponent(set.set_slug)}`}>{set.set_name}</Link>
          </li>
        ))}
      </ul>
      {!sets.length && <p>No sets found.</p>}
    </div>
  );
}
