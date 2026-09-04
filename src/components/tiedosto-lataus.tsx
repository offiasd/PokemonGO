"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

interface TiedostoLatausProps {
  bucket: string;
  arvo: string | null;
  onChange: (url: string | null) => void;
  hyvaksy?: string;
  /** "kuva" = pikkukuva, "linkki" = linkki tiedostoon, "ei" = ei kumpaakaan. */
  esikatselu?: "kuva" | "linkki" | "ei";
  label?: string;
}

export function TiedostoLataus({
  bucket,
  arvo,
  onChange,
  hyvaksy = "image/*",
  esikatselu = "kuva",
  label = "Lataa tiedosto",
}: TiedostoLatausProps) {
  const [lataa, setLataa] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function kasitteleTiedosto(tiedosto: File) {
    setLataa(true);
    try {
      const supabase = createClient();
      const polku = `${crypto.randomUUID()}-${tiedosto.name}`;
      const { error } = await supabase.storage.from(bucket).upload(polku, tiedosto, {
        cacheControl: "3600",
        upsert: false,
      });

      if (error) {
        toast.error(`Lataus epäonnistui: ${error.message}`);
        return;
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(polku);
      onChange(data.publicUrl);
      toast.success("Tiedosto ladattu.");
    } finally {
      setLataa(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-2">
      {arvo && esikatselu === "kuva" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={arvo}
          alt="Esikatselu"
          className="h-32 w-32 rounded-md border object-cover"
        />
      )}
      {arvo && esikatselu === "linkki" && (
        <a
          href={arvo}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary underline underline-offset-2"
        >
          Avaa nykyinen tiedosto
        </a>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={hyvaksy}
          className="hidden"
          onChange={(e) => {
            const tiedosto = e.target.files?.[0];
            if (tiedosto) kasitteleTiedosto(tiedosto);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={lataa}
          onClick={() => inputRef.current?.click()}
        >
          {lataa ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {label}
        </Button>
        {arvo && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Poista"
            onClick={() => onChange(null)}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
