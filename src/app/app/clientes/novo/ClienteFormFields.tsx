'use client';

import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

export function ClienteFormFields() {
  const toast = useToast();
  const [type, setType] = useState<'pf' | 'pj'>('pj');
  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [looking, setLooking] = useState(false);

  const digits = document.replace(/\D/g, '');

  async function buscarCnpj() {
    if (digits.length !== 14) {
      toast.show({ type: 'warning', title: 'Digite os 14 números do CNPJ' });
      return;
    }
    setLooking(true);
    try {
      const res = await fetch(`/api/cnpj/${digits}`);
      const data = await res.json();
      if (data.error) {
        toast.show({ type: 'warning', title: data.error });
        return;
      }
      if (data.razao_social) setName(data.razao_social);
      if (data.nome_fantasia) setTradeName(data.nome_fantasia);
      if (data.email) setEmail(data.email);
      if (data.telefone) setPhone(data.telefone);
      toast.show({ type: 'success', title: 'Dados do CNPJ preenchidos' });
    } catch {
      toast.show({ type: 'error', title: 'Erro ao consultar CNPJ', description: 'Tente novamente em instantes.' });
    } finally {
      setLooking(false);
    }
  }

  return (
    <>
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-slate-900">Tipo</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { v: 'pf' as const, label: 'Pessoa Fisica', desc: 'Caminhoneiro autonomo' },
            { v: 'pj' as const, label: 'Pessoa Juridica', desc: 'Transportadora / frota' },
          ].map(opt => (
            <label
              key={opt.v}
              className="cursor-pointer rounded-lg border-2 border-slate-200 p-3 transition hover:border-sky-400 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50"
            >
              <input
                type="radio"
                name="type"
                value={opt.v}
                required
                className="sr-only"
                checked={type === opt.v}
                onChange={() => setType(opt.v)}
              />
              <div className="font-bold text-slate-900">{opt.label}</div>
              <div className="text-xs text-slate-500">{opt.desc}</div>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-slate-900">Dados basicos</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">{type === 'pj' ? 'CNPJ' : 'CPF'}</label>
            <div className="mt-1 flex gap-2">
              <input
                name="document"
                value={document}
                onChange={e => setDocument(e.target.value)}
                placeholder={type === 'pj' ? '00.000.000/0000-00' : '000.000.000-00'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
              {type === 'pj' && (
                <button
                  type="button"
                  onClick={buscarCnpj}
                  disabled={looking}
                  className="btn-secondary flex-shrink-0"
                  title="Buscar dados do CNPJ"
                >
                  {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Buscar
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Nome fantasia</label>
            <input
              name="trade_name"
              value={tradeName}
              onChange={e => setTradeName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Nome / Razao social *</label>
            <input
              name="name"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              name="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">WhatsApp</label>
            <input
              name="phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="11999998888"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>
        </div>
      </div>
    </>
  );
}
