'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2, FileText, Save, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';

type Report = { id: string; laudo_tecnico: string; laudo_cliente: string; created_at: string };

export function LaudoNarrado({
  workOrderId,
  vehicleSummary,
  initialReports,
}: {
  workOrderId: string;
  vehicleSummary: string;
  initialReports: Report[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const recognitionRef = useRef<any>(null);

  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [generating, setGenerating] = useState(false);
  const [current, setCurrent] = useState<Report | null>(null);
  const [tab, setTab] = useState<'tecnico' | 'cliente'>('tecnico');
  const [reports, setReports] = useState<Report[]>(initialReports);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      let finalText = '';
      for (let i = 0; i < event.results.length; i++) {
        finalText += event.results[i][0].transcript;
      }
      setTranscript(finalText);
    };
    recognition.onerror = () => setRecording(false);
    recognitionRef.current = recognition;
  }, []);

  function toggleRecording() {
    if (!recognitionRef.current) return;
    if (recording) {
      recognitionRef.current.stop();
      setRecording(false);
    } else {
      setTranscript('');
      recognitionRef.current.start();
      setRecording(true);
    }
  }

  async function gerarLaudo() {
    if (!transcript.trim()) {
      toast.show({ type: 'warning', title: 'Grave ou digite o relato primeiro' });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/laudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workOrderId, transcript }),
      });
      const data = await res.json();
      if (data.error) {
        toast.show({ type: 'error', title: 'Nao foi possivel gerar', description: data.message });
        return;
      }
      setCurrent(data.report);
      setReports(prev => [data.report, ...prev]);
      toast.show({ type: 'success', title: 'Laudo gerado' });
    } catch (err: any) {
      toast.show({ type: 'error', title: 'Erro ao gerar laudo', description: err?.message });
    } finally {
      setGenerating(false);
    }
  }

  async function salvarEdicao() {
    if (!current) return;
    setSaving(true);
    const { error } = await supabase
      .from('wo_reports')
      .update({ laudo_tecnico: current.laudo_tecnico, laudo_cliente: current.laudo_cliente })
      .eq('id', current.id);
    setSaving(false);
    if (error) {
      toast.show({ type: 'error', title: 'Erro ao salvar', description: error.message });
      return;
    }
    setReports(prev => prev.map(r => (r.id === current.id ? current : r)));
    toast.show({ type: 'success', title: 'Laudo salvo' });
  }

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
        <FileText className="h-5 w-5 text-sky-600" /> Laudo tecnico narrado
      </h2>

      {!supported && (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Ditado por voz nao disponivel neste navegador — digite o relato abaixo.
        </p>
      )}

      <div className="flex items-start gap-3">
        {supported && (
          <button
            type="button"
            onClick={toggleRecording}
            className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-white ${
              recording ? 'animate-pulse bg-red-600' : 'bg-sky-600 hover:bg-sky-700'
            }`}
          >
            {recording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        )}
        <textarea
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          placeholder='Ex: "a lona do segundo eixo ta no rebite, o tambor riscou, recomendo trocar o jogo e retificar"'
          rows={3}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        />
      </div>

      <button
        type="button"
        onClick={gerarLaudo}
        disabled={generating || !transcript.trim()}
        className="btn-primary mt-3"
      >
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {generating ? 'Gerando…' : 'Gerar laudo'}
      </button>

      {current && (
        <div className="mt-4 rounded-lg border bg-slate-50 p-3">
          <div className="mb-2 flex gap-1">
            <button
              type="button"
              onClick={() => setTab('tecnico')}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                tab === 'tecnico' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600'
              }`}
            >
              Tecnico
            </button>
            <button
              type="button"
              onClick={() => setTab('cliente')}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                tab === 'cliente' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600'
              }`}
            >
              Cliente
            </button>
          </div>
          <textarea
            value={tab === 'tecnico' ? current.laudo_tecnico : current.laudo_cliente}
            onChange={e =>
              setCurrent(c =>
                c ? { ...c, [tab === 'tecnico' ? 'laudo_tecnico' : 'laudo_cliente']: e.target.value } : c,
              )
            }
            rows={4}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <button type="button" onClick={salvarEdicao} disabled={saving} className="btn-secondary mt-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar edicao
          </button>
        </div>
      )}

      {reports.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Laudos anteriores</div>
          <div className="space-y-1">
            {reports.slice(0, 5).map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setCurrent(r)}
                className="block w-full truncate rounded px-2 py-1 text-left text-xs text-slate-600 hover:bg-slate-50"
              >
                {new Date(r.created_at).toLocaleString('pt-BR')} — {r.laudo_cliente.slice(0, 60)}…
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
