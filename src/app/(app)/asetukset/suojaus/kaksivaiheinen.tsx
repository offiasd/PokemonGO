"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface Tekija {
  id: string;
  friendly_name?: string;
  status: string;
}

/**
 * Kaksivaiheinen tunnistus (TOTP-sovellus).
 *
 * Käyttöönotto luo tekijän, näyttää QR-koodin ja vahvistaa sen kertakoodilla.
 * Vahvistamaton tekijä jää roikkumaan jos käyttäjä keskeyttää, joten ne
 * siivotaan pois listaa haettaessa.
 *
 * Kirjautumisen pakotus tehdään proxy.ts:ssä: kun käyttäjällä on vahvistettu
 * tekijä, istunto pitää nostaa aal2-tasolle ennen kuin sovellukseen pääsee.
 */
export function Kaksivaiheinen() {
  const router = useRouter();
  const [tekijat, setTekijat] = useState<Tekija[] | null>(null);
  const [otetaanKayttoon, setOtetaanKayttoon] = useState<{
    id: string;
    qr: string;
    salaisuus: string;
  } | null>(null);
  const [koodi, setKoodi] = useState("");
  const [kaynnissa, aloita] = useTransition();

  /** Hakee vahvistetut tekijät ja siivoaa keskeytyneet käyttöönotot pois. */
  const haeVahvistetut = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw new Error(error.message);
    const kaikki = (data?.all ?? []) as Tekija[];
    for (const t of kaikki.filter((t) => t.status !== "verified")) {
      await supabase.auth.mfa.unenroll({ factorId: t.id });
    }
    return kaikki.filter((t) => t.status === "verified");
  }, []);

  const haeTekijat = useCallback(async () => {
    try {
      setTekijat(await haeVahvistetut());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tietojen haku epäonnistui.");
      setTekijat([]);
    }
  }, [haeVahvistetut]);

  useEffect(() => {
    let peruttu = false;
    void (async () => {
      try {
        const lista = await haeVahvistetut();
        if (!peruttu) setTekijat(lista);
      } catch {
        if (!peruttu) setTekijat([]);
      }
    })();
    return () => {
      peruttu = true;
    };
  }, [haeVahvistetut]);

  function aloitaKayttoonotto() {
    aloita(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Sovellus ${new Date().toLocaleDateString("fi-FI")}`,
      });
      if (error || !data) {
        toast.error(error?.message ?? "Käyttöönotto epäonnistui.");
        return;
      }
      setOtetaanKayttoon({
        id: data.id,
        qr: data.totp.qr_code,
        salaisuus: data.totp.secret,
      });
    });
  }

  function vahvista() {
    if (!otetaanKayttoon) return;
    aloita(async () => {
      const supabase = createClient();
      const { data: haaste, error: haasteVirhe } = await supabase.auth.mfa.challenge({
        factorId: otetaanKayttoon.id,
      });
      if (haasteVirhe || !haaste) {
        toast.error(haasteVirhe?.message ?? "Vahvistus epäonnistui.");
        return;
      }
      const { error } = await supabase.auth.mfa.verify({
        factorId: otetaanKayttoon.id,
        challengeId: haaste.id,
        code: koodi.trim(),
      });
      if (error) {
        toast.error("Koodi ei kelvannut. Tarkista aika ja yritä uudelleen.");
        return;
      }
      setOtetaanKayttoon(null);
      setKoodi("");
      await haeTekijat();
      toast.success("Kaksivaiheinen tunnistus otettu käyttöön.");
      router.refresh();
    });
  }

  function poistaKaytosta(id: string) {
    aloita(async () => {
      if (!window.confirm("Poistetaanko kaksivaiheinen tunnistus käytöstä?")) return;
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) {
        toast.error(error.message);
        return;
      }
      await haeTekijat();
      toast.success("Kaksivaiheinen tunnistus poistettu käytöstä.");
      router.refresh();
    });
  }

  if (tekijat === null) {
    return <p className="text-sm text-muted-foreground">Ladataan...</p>;
  }

  if (tekijat.length > 0) {
    return (
      <div className="grid gap-4 sm:max-w-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-success" />
          <Badge variant="secondary">Käytössä</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Kirjautuminen kysyy tunnistussovelluksen kertakoodin salasanan jälkeen.
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={kaynnissa}
            onClick={() => poistaKaytosta(tekijat[0].id)}
          >
            <ShieldOff className="size-4" />
            Poista käytöstä
          </Button>
        </div>
      </div>
    );
  }

  if (otetaanKayttoon) {
    return (
      <div className="grid gap-4 sm:max-w-sm">
        <p className="text-sm text-muted-foreground">
          Lue koodi tunnistussovelluksella (esimerkiksi Google Authenticator tai 1Password) ja
          syötä sen näyttämä kuusinumeroinen koodi.
        </p>
        {/* QR tulee Supabaselta valmiina SVG-data-URLina. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={otetaanKayttoon.qr}
          alt="QR-koodi tunnistussovellukselle"
          className="size-48 rounded-md border bg-white p-2"
        />
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">
            Tai syötä avain käsin:
          </span>
          <code className="rounded bg-muted px-2 py-1 text-xs break-all">
            {otetaanKayttoon.salaisuus}
          </code>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="mfa_koodi">Kertakoodi</Label>
          <Input
            id="mfa_koodi"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={koodi}
            onChange={(e) => setKoodi(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={vahvista} disabled={kaynnissa || koodi.length !== 6}>
            Vahvista
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={kaynnissa}
            onClick={() =>
              aloita(async () => {
                const supabase = createClient();
                await supabase.auth.mfa.unenroll({ factorId: otetaanKayttoon.id });
                setOtetaanKayttoon(null);
                setKoodi("");
              })
            }
          >
            Peruuta
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:max-w-sm">
      <p className="text-sm text-muted-foreground">
        Kertakoodi tunnistussovelluksesta salasanan lisäksi. Suositeltava varsinkin
        admin-tunnukselle: pelkkä salasana riittää muuten koko maalaamon tietoihin.
      </p>
      <div>
        <Button type="button" onClick={aloitaKayttoonotto} disabled={kaynnissa}>
          <ShieldCheck className="size-4" />
          Ota käyttöön
        </Button>
      </div>
    </div>
  );
}
