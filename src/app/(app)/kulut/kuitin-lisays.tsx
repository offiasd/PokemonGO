"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, Plus, ScanLine } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { lataaKuitinTiedosto } from "@/lib/kuvanpakkaus";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { luoKuitti } from "./actions";

/**
 * Kuitin lisäys kelluvasta painikkeesta.
 *
 * Kuitti kuvataan kassalla tai autossa heti ostoksen jälkeen, joten painike on
 * aina näkyvissä eikä valikon takana. Kamera on ensimmäisenä, tiedosto sen
 * alla: paperikuitteja tulee eniten.
 */
export function KuitinLisays() {
  const router = useRouter();
  const [lataa, setLataa] = useState(false);
  const kameraRef = useRef<HTMLInputElement>(null);
  const tiedostoRef = useRef<HTMLInputElement>(null);

  async function kasittele(tiedosto: File, lahde: "kamera" | "tiedosto") {
    setLataa(true);
    try {
      const lataus = await lataaKuitinTiedosto(tiedosto);
      if (!lataus.ok) {
        toast.error(lataus.virhe);
        return;
      }

      const tulos = await luoKuitti(lataus.polku, lataus.tyyppi, lahde);
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        // Kuitti jäi syntymättä, joten tiedostoa ei kannata jättää roikkumaan.
        await createClient().storage.from("kuitit").remove([lataus.polku]);
        return;
      }

      toast.success("Kuitti tallennettu. Täytä tiedot.");
      if (tulos.id) router.push(`/kulut/${tulos.id}`);
    } finally {
      setLataa(false);
      if (kameraRef.current) kameraRef.current.value = "";
      if (tiedostoRef.current) tiedostoRef.current.value = "";
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
        onChange={(e) => {
          const tiedosto = e.target.files?.[0];
          if (tiedosto) void kasittele(tiedosto, "kamera");
        }}
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
        onChange={(e) => {
          const tiedosto = e.target.files?.[0];
          if (tiedosto) void kasittele(tiedosto, "tiedosto");
        }}
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
            Kuitti
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-64">
          <DropdownMenuItem
            className="items-start"
            onSelect={() => kameraRef.current?.click()}
          >
            <Camera className="mt-0.5 size-4" />
            <span className="grid gap-0.5">
              <span>Kuvaa kuitti</span>
              <span className="text-xs text-muted-foreground">
                Kamera aukeaa suoraan. Nopein kassalla.
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="items-start"
            onSelect={() => tiedostoRef.current?.click()}
          >
            <ScanLine className="mt-0.5 size-4" />
            <span className="grid gap-0.5">
              <span>Skannaa tai valitse tiedosto</span>
              <span className="text-xs text-muted-foreground">
                Puhelimen oma skanneri, kuvakirjasto tai PDF.
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
