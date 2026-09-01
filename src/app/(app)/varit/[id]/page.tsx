import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { haeAsetukset } from "@/lib/supabase/asetukset";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SaldoPalkki } from "@/components/saldo-palkki";
import { maaliTyypinNimi, muotoileEuro, muotoileGrammat, varinLisavaatimus } from "@/lib/vakiot";
import { laskeVarinHintaerittely } from "@/lib/hinnat";

import { paivitaVari } from "../actions";
import { VariLomake } from "../vari-lomake";
import { TaydennaVarastoa } from "./taydenna-varastoa";
import { KorjaaSaldo } from "./korjaa-saldo";
import { PoistaPalautaVari } from "./poista-palauta-vari";

export default async function VariSivu({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const kayttaja = await vaaditaanKayttaja();
  const supabase = await createClient();
  const asetukset = await haeAsetukset();

  const { data: vari } = await supabase.from("varit").select("*").eq("id", id).single();
  if (!vari) notFound();

  const { data: kategoriaRivit } = await supabase
    .from("vari_kategoriat")
    .select("maali_tyyppi")
    .eq("vari_id", id);
  const lisakategoriat = (kategoriaRivit ?? [])
    .map((k) => k.maali_tyyppi)
    .filter((t) => t !== vari.tyyppi);

  // Viimeisimmät saldomuutokset: sekä täydennykset että manuaaliset korjaukset
  // ovat samassa taulussa, joten historia kattaa molemmat.
  const { data: saldohistoria } = await supabase
    .from("varastotayennykset")
    .select("id, maara_g, tyyppi, luotu")
    .eq("vari_id", id)
    .order("luotu", { ascending: false })
    .limit(3);

  const naytaHinnat = kayttaja.role === "admin" || asetukset.nayta_hinnat_maalaajalle;

  const halytysraja = vari.halytysraja_g ?? asetukset.oletus_halytysraja_g;

  const hinta = laskeVarinHintaerittely(vari, asetukset);
  // Pohjaväri-/lakkavaatimus johdetaan maalityypistä, ei tallennetusta tekstistä.
  const lisavaatimus = varinLisavaatimus(vari.tyyppi);
  // Lakkausvaatimus on värikohtainen tieto, ei maalityypistä johdettu.
  const lakkausvaatimus = vari.vaatii_lakkauksen
    ? "Tämä väri vaatii lakkauksen (esim. UV-suoja ulkokäyttöön)."
    : null;

  const varastosaldoKortti = (
    <Card>
      <CardHeader>
        <CardTitle>Varastosaldo</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:max-w-md">
        <div className="grid gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Saldo / hälytysraja {muotoileGrammat(halytysraja)}
            </span>
            <span className="font-medium">{muotoileGrammat(vari.saldo_g)}</span>
          </div>
          <SaldoPalkki saldoG={vari.saldo_g} halytysrajaG={halytysraja} />
        </div>

        <div className="grid gap-3">
          <TaydennaVarastoa variId={vari.id} />
          {/* key pakottaa kentän ajan tasalle aina kun saldo muuttuu. */}
          <KorjaaSaldo key={vari.saldo_g} variId={vari.id} nykyinenSaldoG={vari.saldo_g} />
        </div>

        <div className="grid gap-1 border-t pt-3 text-sm">
          <p className="font-medium">Viimeisimmät saldomuutokset</p>
          {(saldohistoria ?? []).length === 0 && (
            <p className="text-muted-foreground">Ei kirjauksia.</p>
          )}
          {(saldohistoria ?? []).map((muutos) => (
            <div key={muutos.id} className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                {new Date(muutos.luotu).toLocaleDateString("fi-FI")}
                {muutos.tyyppi === "korjaus" && " - korjaus"}
              </span>
              <span
                className={
                  muutos.maara_g < 0 ? "font-medium text-destructive" : "font-medium text-success"
                }
              >
                {muutos.maara_g > 0 && "+"}
                {muotoileGrammat(muutos.maara_g)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  const hinnoitteluKortti = (
    <Card>
      <CardHeader>
        <CardTitle>Hinnoittelu</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm sm:max-w-md">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Ostohinta myyjältä (netto)</span>
          <span>{muotoileEuro(hinta.ostohinta)}/kg</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">
            Toimituskulu ({vari.alkupera}, asetuksista)
          </span>
          <span>+{muotoileEuro(hinta.toimituskulu)}/kg</span>
        </div>
        {vari.alkupera !== "EU" && (
          <>
            <div className="flex justify-between gap-2 border-t pt-2">
              <span className="text-muted-foreground">Tullausarvo (sis. rahdin)</span>
              <span>{muotoileEuro(hinta.tullausarvo)}/kg</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                Tullimaksu {hinta.tullimaksuProsentti} %
              </span>
              <span>+{muotoileEuro(hinta.tulli)}/kg</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                Maahantuonnin ALV {hinta.alvProsentti} %
              </span>
              <span>+{muotoileEuro(hinta.alv)}/kg</span>
            </div>
          </>
        )}
        <div className="mt-1 flex justify-between gap-2 border-t pt-2 font-medium">
          <span>Kokonaishinta</span>
          <span>{muotoileEuro(hinta.kokonaishinta)}/kg</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Toimituskulu, tulli ja ALV tulevat Asetukset-sivulta ja lisätään hintaan
          automaattisesti.
          {vari.alkupera !== "EU" &&
            " Tulli ja ALV lasketaan myös rahdista, koska rahti kuuluu tullausarvoon."}{" "}
          Kokonaishintaa käytetään kaikissa kustannus- ja hinta-arvioissa.
        </p>
      </CardContent>
    </Card>
  );

  if (kayttaja.role === "admin") {
    return (
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{vari.nimi}</h1>
            <p className="text-muted-foreground">{vari.valmistaja ?? "Valmistaja tuntematon"}</p>
          </div>
          <PoistaPalautaVari variId={vari.id} aktiivinen={vari.aktiivinen} />
        </div>

        {varastosaldoKortti}

        {naytaHinnat && hinnoitteluKortti}

        <Card>
          <CardHeader>
            <CardTitle>Muokkaa värin tietoja</CardTitle>
          </CardHeader>
          <CardContent>
            <VariLomake
              vari={vari}
              lisakategoriat={lisakategoriat}
              formAction={paivitaVari.bind(null, vari.id)}
              asetuksetOletusHalytysraja={asetukset.oletus_halytysraja_g}
              toimituskuluOletusEu={asetukset.toimituskulu_per_kg_eu_oletus}
              toimituskuluOletusUsa={asetukset.toimituskulu_per_kg_usa_oletus}
              toimituskuluOletusMuu={asetukset.toimituskulu_per_kg_muu_oletus}
              tullimaksuOletus={asetukset.tullimaksu_prosentti_oletus}
              alvOletus={asetukset.alv_prosentti_oletus}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{vari.nimi}</h1>
          <p className="text-muted-foreground">{vari.valmistaja ?? "Valmistaja tuntematon"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{vari.alkupera}</Badge>
          <Badge variant="outline">{maaliTyypinNimi(vari.tyyppi)}</Badge>
          {vari.kiiltoaste && <Badge variant="outline">{vari.kiiltoaste}</Badge>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {varastosaldoKortti}

        {vari.kuva_url && (
          <Card>
            <CardHeader>
              <CardTitle>Kuva</CardTitle>
            </CardHeader>
            <CardContent>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={vari.kuva_url}
                alt={vari.nimi}
                className="max-h-64 rounded-md border object-contain"
              />
            </CardContent>
          </Card>
        )}
      </div>

      {naytaHinnat && hinnoitteluKortti}

      {(vari.ohjeet || vari.ohje_tiedosto_url || vari.myyja_linkki || lisavaatimus ||
        lakkausvaatimus) && (
        <Card>
          <CardHeader>
            <CardTitle>Maalausohjeet</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {lisavaatimus && (
              <p className="rounded-md border bg-muted/30 p-3">{lisavaatimus}</p>
            )}
            {lakkausvaatimus && (
              <p className="rounded-md border bg-muted/30 p-3">{lakkausvaatimus}</p>
            )}
            {vari.ohjeet && <p className="whitespace-pre-wrap">{vari.ohjeet}</p>}
            {vari.ohje_tiedosto_url && (
              <Link
                href={vari.ohje_tiedosto_url}
                target="_blank"
                className="flex items-center gap-1.5 text-primary underline underline-offset-2"
              >
                <FileText className="size-4" />
                Avaa ohjetiedosto
              </Link>
            )}
            {vari.myyja_linkki && (
              <Link
                href={vari.myyja_linkki}
                target="_blank"
                className="flex items-center gap-1.5 text-primary underline underline-offset-2"
              >
                <ExternalLink className="size-4" />
                Myyjän tuotesivu
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
