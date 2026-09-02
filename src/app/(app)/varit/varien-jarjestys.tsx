"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JARJESTYKSET, OLETUS_JARJESTYS } from "@/lib/vakiot";

/**
 * Järjestysvalinta värilistan yläpuolelle.
 *
 * Erillään suodattimista, koska järjestys ei rajaa mitään: se kuuluu listan
 * yläpuolelle eikä sivupalkkiin muiden rajausten joukkoon.
 */
export function VarienJarjestysValinta({ naytaHinnat }: { naytaHinnat: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jarjestys = searchParams.get("jarjestys") ?? OLETUS_JARJESTYS;
  const vaihtoehdot = JARJESTYKSET.filter((j) => naytaHinnat || !j.vaatiiHinnat);

  function vaihda(arvo: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (arvo === OLETUS_JARJESTYS) {
      params.delete("jarjestys");
    } else {
      params.set("jarjestys", arvo);
    }
    // Järjestys sekoittaa listan kokonaan, joten sivunumerolla ei ole enää
    // merkitystä - palataan ensimmäiselle sivulle.
    params.delete("sivu");
    router.push(`/varit?${params.toString()}`);
  }

  return (
    <div className="grid gap-1.5">
      <Label
        htmlFor="jarjestys"
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <ArrowUpDown className="size-3.5" />
        Järjestys
      </Label>
      <Select value={jarjestys} onValueChange={vaihda}>
        <SelectTrigger id="jarjestys" className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {vaihtoehdot.map(({ arvo, nimi }) => (
            <SelectItem key={arvo} value={arvo}>
              {nimi}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
