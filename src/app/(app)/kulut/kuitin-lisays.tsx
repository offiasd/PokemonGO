"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Images, Loader2, Plus, ScanLine } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { lataaKuitinTiedosto } from "@/lib/kuvanpakkaus";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { luoKuitti, luoKuititErasta, type LadattuTiedosto } from "./actions";

/** Yläraja yhdelle erälle. Suojaa Storage-tilaa ja poiminnan kuluja. */
const ERAN_ENIMMAISMAARA = 20;

/**
 * Kuitin lisäys kelluvasta painikkeesta.
 *
 * Kuitti kuvataan kassalla tai autossa heti ostoksen jälkeen, joten painike on
 * aina näkyvissä eikä valikon takana. Kamera on ensimmäisenä, tiedosto sen
 * alla: paperikuitteja tulee eniten.
 *
 * Monta tiedostoa kerralla menee eri reittiä kuin yksi: yhden kuitin voi lukea
 * heti auki olevalla sivulla, mutta kahtakymmentä ei - ne tallennetaan ensin ja
 * luetaan jonosta taustalla, jolloin näkymän voi sulkea kesken.
 */
export function KuitinLisays() {
  const router = useRouter();
  const [lataa, setLataa] = useState(false);
  const [edistyminen, setEdistyminen] = useState<string | null>(null);
  const kameraRef = useRef<HTMLInputElement>(null);
  const tiedostoRef = useRef<HTMLInputElement>(null);
  const montaRef = useRef<HTMLInputElement>(null);

  async function kasitteleYksi(tiedosto: File, lahde: "kamera" | "tiedosto") {
    const lataus = await lataaKuitinTiedosto(tiedosto);
    if (!lataus.ok) {
      toast.error(lataus.virhe);
      return;
    }

    const tulos = await luoKuitti(lataus.polku, lataus.tyyppi, lahde, lataus.tiiviste);
    if (!tulos.ok) {
      toast.error(tulos.virhe);
      // Kuitti jäi syntymättä, joten tiedostoa ei kannata jättää roikkumaan.
      await createClient().storage.from("kuitit").remove([lataus.polku]);
      return;
    }

    toast.success("Kuitti tallennettu. Täytä tiedot.");
    if (tulos.id) router.push(`/kulut/${tulos.id}`);
  }

  async function kasitteleMonta(tiedostot: File[], lahde: "kamera" | "tiedosto") {
    const supabase = createClient();

    if (tiedostot.length > ERAN_ENIMMAISMAARA) {
      toast.error(
        `Kerralla voi lisätä enintään ${ERAN_ENIMMAISMAARA} tiedostoa. Ensimmäiset ${ERAN_ENIMMAISMAARA} otetaan mukaan.`
      );
      tiedostot = tiedostot.slice(0, ERAN_ENIMMAISMAARA);
    }

    const { data: eraId, error: eraVirhe } = await supabase.rpc("luo_kuittiera", {
      p_tiedostoja: tiedostot.length,
    });
    if (eraVirhe || !eraId) {
      toast.error(eraVirhe?.message ?? "Erän luonti epäonnistui.");
      return;
    }

    const ladatut: LadattuTiedosto[] = [];
    const nahdyt = new Set<string>();
    let kaksoiskappaleita = 0;
    let epaonnistuneita = 0;

    for (const [i, tiedosto] of tiedostot.entries()) {
      setEdistyminen(`${i + 1}/${tiedostot.length}`);

      const lataus = await lataaKuitinTiedosto(tiedosto);
      if (!lataus.ok) {
        epaonnistuneita += 1;
        toast.error(`${tiedosto.name}: ${lataus.virhe}`);
        continue;
      }

      // Sama tiedosto tulee helposti kahdesti kun valitsee galleriasta.
      // Erän sisäinen kaksoiskappale karsitaan tässä, aiemmin ladattu
      // tunnistetaan liitteiden tiivisteistä.
      if (nahdyt.has(lataus.tiiviste)) {
        kaksoiskappaleita += 1;
        await supabase.storage.from("kuitit").remove([lataus.polku]);
        continue;
      }
      const { data: aiempi } = await supabase
        .from("kuitin_liitteet")
        .select("id")
        .eq("tiiviste", lataus.tiiviste)
        .limit(1);
      if (aiempi && aiempi.length > 0) {
        kaksoiskappaleita += 1;
        await supabase.storage.from("kuitit").remove([lataus.polku]);
        continue;
      }

      nahdyt.add(lataus.tiiviste);
      ladatut.push({ polku: lataus.polku, tyyppi: lataus.tyyppi, tiiviste: lataus.tiiviste });
    }

    if (ladatut.length === 0) {
      toast.error(
        kaksoiskappaleita > 0
          ? "Kaikki tiedostot olivat kaksoiskappaleita - mitään ei lisätty."
          : "Yhtään tiedostoa ei saatu ladattua."
      );
      return;
    }

    const tulos = await luoKuititErasta(eraId, ladatut, lahde);
    if (!tulos.ok) {
      toast.error(tulos.virhe);
      await supabase.storage.from("kuitit").remove(ladatut.map((l) => l.polku));
      return;
    }

    const huomiot = [
      kaksoiskappaleita > 0 ? `${kaksoiskappaleita} kaksoiskappaletta ohitettiin` : null,
      epaonnistuneita > 0 ? `${epaonnistuneita} epäonnistui` : null,
    ].filter(Boolean);
    toast.success(
      `${tulos.luotuja} kuittia lisätty jonoon.${huomiot.length > 0 ? ` ${huomiot.join(", ")}.` : ""}`
    );
    router.push(`/kulut/era/${eraId}`);
  }

  async function kasittele(tiedostot: File[], lahde: "kamera" | "tiedosto") {
    if (tiedostot.length === 0) return;
    setLataa(true);
    try {
      if (tiedostot.length === 1) {
        await kasitteleYksi(tiedostot[0], lahde);
      } else {
        await kasitteleMonta(tiedostot, lahde);
      }
    } finally {
      setLataa(false);
      setEdistyminen(null);
      if (kameraRef.current) kameraRef.current.value = "";
      if (tiedostoRef.current) tiedostoRef.current.value = "";
      if (montaRef.current) montaRef.current.value = "";
    }
  }

  return (
    <>
      {/* capture avaa kameran suoraan ilman valitsinta. Se on nopein tapa
          kassalla, mutta samalla se ohittaa käyttöjärjestelmän oman
          valikon - eli myös puhelimen asiakirjaskannerin. Siksi alla on
          toinen syöte ilman capturea. */}
      <input
        ref={kameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void kasittele([...(e.target.files ?? [])], "kamera")}
      />
      {/* Ilman capturea puhelin näyttää oman valitsimensa: kuvakirjasto,
          kamera ja tiedostoselain. Asiakirjaskanneri löytyy sitä kautta -
          verkkosovelluksesta sitä ei voi avata suoraan, koska selaimessa ei
          ole siihen rajapintaa. */}
      <input
        ref={tiedostoRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => void kasittele([...(e.target.files ?? [])], "tiedosto")}
      />
      <input
        ref={montaRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => void kasittele([...(e.target.files ?? [])], "tiedosto")}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="lg"
            disabled={lataa}
            aria-label="Lisää kuitti"
            className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 rounded-full shadow-lg md:bottom-4"
          >
            {lataa ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
            {lataa && edistyminen ? edistyminen : "Kuitti"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-64">
          <DropdownMenuItem className="items-start" onSelect={() => kameraRef.current?.click()}>
            <Camera className="mt-0.5 size-4" />
            <span className="grid gap-0.5">
              <span>Kuvaa kuitti</span>
              <span className="text-xs text-muted-foreground">
                Kamera aukeaa suoraan. Nopein kassalla.
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem className="items-start" onSelect={() => tiedostoRef.current?.click()}>
            <ScanLine className="mt-0.5 size-4" />
            <span className="grid gap-0.5">
              <span>Skannaa tai valitse tiedosto</span>
              <span className="text-xs text-muted-foreground">
                Puhelimen oma skanneri, kuvakirjasto tai PDF.
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem className="items-start" onSelect={() => montaRef.current?.click()}>
            <Images className="mt-0.5 size-4" />
            <span className="grid gap-0.5">
              <span>Lisää monta kerralla</span>
              <span className="text-xs text-muted-foreground">
                Enintään {ERAN_ENIMMAISMAARA}. Luku etenee taustalla.
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
