'use client';

import { useState } from 'react';
import { AlertTriangle, MapPin, CheckCircle2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function SocorroForm({ tenantSlug }: { tenantSlug: string }) {
  const supabase = createClient();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [issue, setIssue] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  function pegarLocalizacao() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function enviar() {
    if (!phone.trim() || !issue.trim()) {
      setError('Preencha telefone e o problema');
      return;
    }
    setSending(true);
    setError('');
    const link = location ? `https://maps.google.com/?q=${location.lat},${location.lng}` : null;
    const { error: rpcError } = await supabase.rpc('public_create_roadside_call', {
      p_tenant_slug: tenantSlug,
      p_contact_phone: phone,
      p_contact_name: name || null,
      p_reported_issue: issue,
      p_location_lat: location?.lat ?? null,
      p_location_lng: location?.lng ?? null,
      p_location_link: link,
    });
    setSending(false);
    if (rpcError) {
      setError('Não foi possível abrir o chamado. Ligue direto para a oficina.');
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" />
        <h1 className="mt-4 text-xl font-bold text-slate-900">Chamado aberto!</h1>
        <p className="mt-2 text-slate-600">A oficina foi avisada e vai entrar em contato pelo telefone informado.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <div className="mb-4 flex items-center gap-2 text-red-600">
        <AlertTriangle className="h-7 w-7" />
        <h1 className="text-xl font-bold">Socorro 24h</h1>
      </div>

      <div className="space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" className="input-base w-full" />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Telefone (+55...)" className="input-base w-full" />
        <textarea
          value={issue}
          onChange={e => setIssue(e.target.value)}
          placeholder="O que aconteceu com o caminhão?"
          rows={3}
          className="input-base w-full"
        />

        <button onClick={pegarLocalizacao} disabled={locating} className="btn-secondary w-full">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {location ? 'Localização capturada ✓' : 'Enviar minha localização'}
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={enviar}
          disabled={sending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
          Chamar socorro
        </button>
      </div>
    </div>
  );
}
