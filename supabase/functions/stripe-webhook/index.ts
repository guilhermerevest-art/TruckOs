// Stripe webhook: idempotente via subscription_events
// Rodar com: supabase functions deploy stripe-webhook --no-verify-jwt

import Stripe from 'https://esm.sh/stripe@17?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-09-30.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

Deno.serve(async req => {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('missing signature', { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    return new Response(`invalid signature: ${err}`, { status: 400 });
  }

  // idempotencia
  const { error: insertErr } = await supabase
    .from('subscription_events')
    .insert({
      stripe_event_id: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

  if (insertErr) {
    // duplicado = ja tratado
    return new Response('ok (duplicate)', { status: 200 });
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (tenant) {
        const status =
          sub.status === 'active' || sub.status === 'trialing'
            ? sub.status === 'trialing'
              ? 'trialing'
              : 'active'
            : sub.status === 'past_due'
            ? 'past_due'
            : 'canceled';

        await supabase
          .from('tenants')
          .update({
            status,
            stripe_subscription_id: sub.id,
            plan: (sub.items.data[0]?.price.lookup_key as 'starter' | 'pro' | 'fleet') ?? 'starter',
          })
          .eq('id', tenant.id);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      await supabase
        .from('tenants')
        .update({ status: 'canceled' })
        .eq('stripe_customer_id', customerId);
      break;
    }

    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const customerId =
        typeof inv.customer === 'string' ? inv.customer : inv.customer!;
      await supabase
        .from('tenants')
        .update({ status: 'past_due' })
        .eq('stripe_customer_id', customerId);
      break;
    }
  }

  return new Response('ok', { status: 200 });
});