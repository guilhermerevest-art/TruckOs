// Cria sessao de checkout no Stripe para assinaturas
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-09-30.acacia',
});

export async function POST(req: Request) {
  const { plan } = await req.json();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const adminSupabase = createAdminClient();
  const { data: membership } = await adminSupabase
    .from('tenant_members')
    .select('tenant_id, tenant:tenants(id,name,stripe_customer_id,slug,plan)')
    .eq('user_id', user.id)
    .eq('active', true)
    .single();
  const tenant = membership?.tenant as any;
  if (!tenant) return NextResponse.json({ error: 'no tenant' }, { status: 400 });

  const priceIds: Record<string, string> = {
    starter: process.env.STRIPE_PRICE_STARTER!,
    pro: process.env.STRIPE_PRICE_PRO!,
    fleet: process.env.STRIPE_PRICE_FLEET!,
  };

  let customerId = tenant.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email!,
      name: tenant.name,
      metadata: { tenant_id: tenant.id, slug: tenant.slug },
    });
    customerId = customer.id;
    await adminSupabase
      .from('tenants')
      .update({ stripe_customer_id: customerId })
      .eq('id', tenant.id);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card', 'pix'],
    line_items: [{ price: priceIds[plan], quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/app?upgrade=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?upgrade=cancel`,
    subscription_data: {
      trial_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      metadata: { tenant_id: tenant.id },
    },
  });

  return NextResponse.json({ url: session.url });
}