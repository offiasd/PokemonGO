"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * Värihaku listan yläpuolella.
 *
 * Erillään suodatinpaneelista, koska haku on se rajaus jota käytetään
 * useimmin: puhelimessa sen kaivaminen napin takaa hidastaisi turhaan.
 */
export function VarienHaku() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function hae(arvo: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (arvo) {
      params.set("q", arvo);
    } else {
      params.delete("q");
    }
    // Hakuehdon muuttuessa palataan alkuun, ettei vanha sivunumero osoita
    // tyhjään kohtaan lyhentynyttä listaa.
    params.delete("sivu");
    router.push(`/varit?${params.toString()}`);
  }

  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label="Hae värejä"
        placeholder="Hae nimellä tai valmistajalla..."
        defaultValue={searchParams.get("q") ?? ""}
        className="pl-8"
        onChange={(e) => hae(e.target.value || "")}
      />
    </div>
  );
}
