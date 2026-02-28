'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password })
    });
    setLoading(false);
    if (!res.ok) {
      setError('Invalid password');
      return;
    }
    router.push(params.get('next') || '/');
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 400 }}>
      <h1>Gallery Password</h1>
      <form onSubmit={submit}>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button disabled={loading} type="submit">Enter</button>
      </form>
      {error && <p>{error}</p>}
    </div>
  );
}
