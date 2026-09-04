-- Vastaanotetun työn kirjaus kaatui rivitason käytäntöön.
--
-- Töiden lisäyskäytäntö vaati aloitti_id = auth.uid(): työn saa luoda vain
-- omiin nimiinsä. Vastaanotetulla työllä maalaus ei ole vielä alkanut, joten
-- aloitti_id on tarkoituksella null - ja null = auth.uid() ei ole tosi, joten
-- käytäntö torjui rivin. "Vastaanota työ" antoi siksi 403:n, kun taas "Aloita
-- heti" meni läpi. Vika tuli mukana vastaanotettujen töiden myötä eikä ollut
-- ennen sitä olemassa.
--
-- Sama vaatimus säilyy, mutta se katsoo nyt sitä kenttää joka työn luonnissa
-- oikeasti täytetään: aloitettu työ omiin nimiin, vastaanotettu työ
-- vastaanottajan nimiin.
drop policy if exists "Kirjautuneet aloittavat töitä" on public.tyot;

create policy "Kirjautuneet kirjaavat töitä" on public.tyot
  for insert with check (
    auth.role() = 'authenticated'
    and (
      aloitti_id = auth.uid()
      or (aloitti_id is null and vastaanotti_id = auth.uid())
    )
  );

comment on column public.tyot.vastaanotti_id is
  'Kuka kirjasi työn vastaanotetuksi. Vastaanotetulla työllä aloitti_id on vielä null.';
