"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, Paperclip, Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { luoKuitti } from "./actions";

/** Kantaan asetettu yläraja on 10 MB; tarkistetaan jo selaimessa. */
const ENIMMAISKOKO_TAVUA = 10 * 1024 * 1024;
/** Pidemmän sivun pikselimäärä pakkauksen jälkeen. Kuitin teksti pysyy luettavana. */
const PAKATUN_SIVU_PX = 2000;
const PAKKAUKSEN_LAATU = 0.82;

/**
 * Kuva pienemmäksi ennen tallennusta.
 *
 * Kuusi vuotta kuitteja on satoja kuvia, ja puhelimen kamera tuottaa niistä
 * jokaisesta useita megatavuja. Pakkaus ei kosketa alkuperäistä tiedostoa
 * palvelimella - se on jo tämä, koska pakkaus tehdään ennen lähetystä.
 *
 * PDF ja HEIC menevät läpi sellaisenaan: canvas ei osaa niitä, ja PDF on jo
 * valmiiksi pieni.
 */
async function pakkaaKuva(tiedosto: File): Promise<File> {
  if (!tiedosto.type.startsWith("image/") || tiedosto.type === "image/heic") return tiedosto;

  const kuva = await createImageBitmap(tiedosto).catch(() => null);
  if (!kuva) return tiedosto;

  const suurin = Math.max(kuva.width, kuva.height);
  const kerroin = suurin > PAKATUN_SIVU_PX ? PAKATUN_SIVU_PX / suurin : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(kuva.width * kerroin);
  canvas.height = Math.round(kuva.height * kerroin);
  const konteksti = canvas.getContext("2d");
  if (!konteksti) return tiedosto;
  konteksti.drawImage(kuva, 0, 0, canvas.width, canvas.height);

  const pakattu = await new Promise<Blob | null>((valmis) =>
    canvas.toBlob(valmis, "image/jpeg", PAKKAUKSEN_LAATU)
  );
  // Jos pakkaus ei pienennä, käytetään alkuperäistä: pieni kuva voi kasvaa
  // uudelleenpakkauksessa.
  if (!pakattu || pakattu.size >= tiedosto.size) return tiedosto;

  return new File([pakattu], tiedosto.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
  });
}

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
      const pakattu = await pakkaaKuva(tiedosto);
      if (pakattu.size > ENIMMAISKOKO_TAVUA) {
        toast.error(
          `Tiedosto on ${(pakattu.size / 1024 / 1024).toFixed(1)} MB - yläraja on 10 MB.`
        );
        return;
      }

      const supabase = createClient();
      const paate = pakattu.name.split(".").pop() ?? "jpg";
      const polku = `${new Date().getFullYear()}/${crypto.randomUUID()}.${paate}`;
      const { error } = await supabase.storage.from("kuitit").upload(polku, pakattu, {
        contentType: pakattu.type,
        upsert: false,
      });
      if (error) {
        toast.error(`Lataus epäonnistui: ${error.message}`);
        return;
      }

      const tulos = await luoKuitti(polku, pakattu.type, lahde);
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        // Kuitti jäi syntymättä, joten tiedostoa ei kannata jättää roikkumaan.
        await supabase.storage.from("kuitit").remove([polku]);
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
        <DropdownMenuContent align="end" side="top">
          <DropdownMenuItem onSelect={() => kameraRef.current?.click()}>
            <Camera className="size-4" />
            Kuvaa kuitti
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => tiedostoRef.current?.click()}>
            <Paperclip className="size-4" />
            Liitä tiedosto (PDF tai kuva)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
