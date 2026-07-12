import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  ClipboardList,
  Boxes,
  MessageCircle,
  BarChart3,
  LogOut,
  Users,
  Wrench,
  Wallet,
  Settings,
  ShoppingCart,
  Receipt,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { HelperWidget } from '@/components/Helper/Tour';
import { ToastProvider } from '@/components/ui/Toast';
import { SearchPalette } from '@/components/SearchPalette';
import { SWRegister } from '@/components/SWRegister';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id,name,slug,status,plan,brand_color')
    .single();

  async function signOut() {
    'use server';
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
  }

  const navItems = [
    { href: '/app', icon: LayoutDashboard, label: 'Visao geral' },
    { href: '/app/os', icon: ClipboardList, label: 'Ordens de servico' },
    { href: '/app/clientes', icon: Users, label: 'Clientes & Frotas' },
    { href: '/app/orcamentos', icon: Wallet, label: 'Orcamentos' },
    { href: '/app/estoque', icon: Boxes, label: 'Estoque' },
    { href: '/app/compras', icon: ShoppingCart, label: 'Compras' },
    { href: '/app/vendas', icon: Receipt, label: 'Vendas balcão' },
    { href: '/app/pm', icon: Wrench, label: 'Preventiva' },
    { href: '/app/whatsapp', icon: MessageCircle, label: 'WhatsApp' },
    { href: '/app/financeiro', icon: Wallet, label: 'Financeiro' },
    { href: '/app/relatorios', icon: BarChart3, label: 'Relatorios' },
    { href: '/app/admin', icon: Settings, label: 'Configuracoes' },
  ];

  return (
    <ToastProvider>
      <SWRegister />
      <div className="flex min-h-screen bg-slate-50">
        <aside className="hidden w-60 flex-col border-r bg-white lg:flex">
          <div className="flex h-16 items-center border-b px-4">
            <Logo size="sm" href="/app" />
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3 text-sm scrollbar-thin">
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <item.icon className="h-4 w-4 text-slate-500" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t p-3">
            <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <div className="truncate font-semibold text-slate-900">{tenant?.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="badge badge-primary">{tenant?.plan}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-500">{tenant?.status}</span>
              </div>
            </div>
            <form action={signOut}>
              <button type="submit" className="btn-ghost w-full justify-start">
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </form>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">{children}</main>

        {/* Floating widgets */}
        <SearchPalette />
        <HelperWidget module="geral" />
      </div>
    </ToastProvider>
  );
}