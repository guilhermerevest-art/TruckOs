'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get('name'),
      slug: String(fd.get('slug') || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-'),
      email: fd.get('email'),
      password: fd.get('password'),
    };

    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Erro ao criar oficina');
      setLoading(false);
      return;
    }

    // ja logado pelo signUp - vai pro app
    router.push('/app');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900">Criar sua oficina</h1>
        <p className="mt-2 text-sm text-slate-600">30 dias gratis, sem cartao de credito.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Nome da oficina</label>
            <input
              name="name"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              placeholder="Oficina do Joao"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">URL (slug)</label>
            <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-slate-50 px-3">
              <span className="text-sm text-slate-500">truckos.app/</span>
              <input
                name="slug"
                required
                pattern="[a-z0-9-]+"
                className="w-full bg-transparent py-2 pl-1 outline-none"
                placeholder="oficina-do-joao"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Seu email</label>
            <input
              type="email"
              name="email"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Senha</label>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-sky-600 py-3 font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
          >
            {loading ? 'Criando...' : 'Criar oficina gratis'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Ja tem conta?{' '}
          <Link href="/login" className="font-semibold text-sky-600 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}