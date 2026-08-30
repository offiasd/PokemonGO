import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";

import { HakuNakyma } from "./haku-nakyma";

export default async function HakuSivu() {
  await vaaditaanKayttaja();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Haku</h1>
        <p className="text-muted-foreground">
          Yhdistetty haku väreille ja osille - toimii myös osittaisilla tai typo-toleranteilla
          hakusanoilla.
        </p>
      </div>

      <HakuNakyma />
    </div>
  );
}
