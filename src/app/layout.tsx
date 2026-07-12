import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'TruckOS — Gestao para oficinas de caminhoes',
    template: '%s · TruckOS',
  },
  description:
    'Sistema completo de gestao para oficinas de caminhoes. OS digital, WhatsApp nativo, estoque sem furo, faturamento automatico. 30 dias gratis.',
  keywords: [
    'sistema oficina caminhoes',
    'ordem de servico caminhoes',
    'software oficina mecanica pesada',
    'sistema oficina whatsapp',
    'gestao oficina de caminhoes',
    'gestao frota caminhoes',
  ],
  authors: [{ name: 'TruckOS' }],
  openGraph: {
    title: 'TruckOS — Sua oficina de caminhoes no controle',
    description: 'OS digital, WhatsApp nativo, estoque sem furo. 30 dias gratis, sem cartao.',
    type: 'website',
    locale: 'pt_BR',
    siteName: 'TruckOS',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'TruckOS — gestao para oficinas de caminhoes',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TruckOS — Sua oficina de caminhoes no controle',
    description: 'OS digital, WhatsApp nativo, 30 dias gratis.',
    images: ['/og-image.svg'],
  },
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}