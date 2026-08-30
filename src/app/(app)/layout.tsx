import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";

import { SovellusNavigaatio } from "./sovellus-navigaatio";

export default async function SovellusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const kayttaja = await vaaditaanKayttaja();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <SovellusNavigaatio kayttaja={kayttaja} />
      <main className="flex-1 overflow-x-hidden p-4 md:p-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
