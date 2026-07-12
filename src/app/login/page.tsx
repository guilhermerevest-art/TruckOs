import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default function LoginPage() {
  async function login(formData: FormData) {
    'use server';
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    redirect('/app');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-slate-900">Entrar</h1>
        <form action={login} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
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
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-sky-600 py-3 font-semibold text-white transition hover:bg-sky-700"
          >
            Entrar
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">
          Ainda nao tem conta?{' '}
          <Link href="/signup" className="font-semibold text-sky-600 hover:underline">
            Criar agora
          </Link>
        </p>
      </div>
    </main>
  );
}