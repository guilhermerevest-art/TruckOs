import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { suggestRoadsideChecklist } from '@/lib/ai/roadside';

export async function POST(req: Request) {
  const { callId } = await req.json();
  if (!callId) return NextResponse.json({ error: 'missing_call_id' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: call } = await supabase.from('roadside_calls').select('reported_issue').eq('id', callId).single();
  if (!call) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let checklist;
  try {
    checklist = await suggestRoadsideChecklist(call.reported_issue);
  } catch {
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 200 });
  }

  await supabase.from('roadside_calls').update({ suggested_checklist: checklist }).eq('id', callId);

  return NextResponse.json({ checklist });
}
