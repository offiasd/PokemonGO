import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";

import { AsetustenNavigaatio } from "./asetusten-navigaatio";

export default async function AsetuksetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const kayttaja = await vaaditaanKayttaja();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Asetukset</h1>
        <p className="text-muted-foreground">
          {kayttaja.role === "admin"
            ? "Oma tili sekä maalaamon hinnoittelu-, työ- ja varastoasetukset."
            : "Omat tietosi ja kirjautumisen suojaus."}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
        {/* min-w-0 pitää vierivän osiorivin puhelimessa ruudun sisällä: ilman
            sitä ruudukon sarake venyisi rivin koko leveyteen. */}
        <aside className="min-w-0 lg:sticky lg:top-6">
          <AsetustenNavigaatio onAdmin={kayttaja.role === "admin"} />
        </aside>
        <div className="grid min-w-0 gap-6">{children}</div>
      </div>
    </div>
  );
}
