import { SocorroForm } from './SocorroForm';

export default async function SocorroPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="flex min-h-screen items-center justify-center bg-red-50 p-4">
      <SocorroForm tenantSlug={slug} />
    </main>
  );
}
