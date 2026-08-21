// Geschaeftslogik der Tablet-Kasse - Pendant zu kiosk/repository.py,
// beschraenkt auf das, was auf dem Tablet gebraucht wird: Verkauf +
// automatischer Warenausgang, Storno, Kassensturz. Produktverwaltung,
// Benutzerverwaltung, Warenwirtschaft (Wareneingang/Korrektur/Inventur),
// Schiedsrichter-Auszahlungen erfassen, Auswertung/Monatsabrechnung und
// Drucken bleiben bewusst der Windows-App vorbehalten - hier werden die
// dafuer noetigen Tabellen nur mitgelesen (siehe sync.js).
//
// Wie am Rechner sind Kassiervorgaenge, Positionen, Lagerbewegungen und
// Kassenstuerze unveraenderliche Ereignisse: sie werden nur angelegt, nie
// nachtraeglich veraendert oder geloescht. Ein Storno legt einen neuen,
// gegenlaeufigen Vorgang an statt den Original-Vorgang zu veraendern.

import { getAll, get, put, geraetId, jetzt, neueId } from "./db.js";
import { GERAET_NAME } from "./config.js";
import { rund2 } from "./format.js";
import { pinPruefen } from "./auth.js";

// ---------------------------------------------------------------------
// Produkte / Benutzer (reine Lesekopien, siehe sync.js)
// ---------------------------------------------------------------------

export async function listeProdukte(nurAktive = true) {
  const alle = await getAll("produkte");
  const gefiltert = nurAktive ? alle.filter((p) => p.aktiv) : alle;
  return gefiltert.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export async function listeBenutzer(nurAktive = true) {
  const alle = await getAll("benutzer");
  const gefiltert = nurAktive ? alle.filter((b) => b.aktiv) : alle;
  return gefiltert.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export async function benutzerAnmelden(benutzerId, pin) {
  const b = await get("benutzer", benutzerId);
  if (!b || !b.aktiv) return null;
  const ok = await pinPruefen(pin, b.pin_hash, b.pin_salt);
  return ok ? b : null;
}

// ---------------------------------------------------------------------
// Lagerbewegungen (nur der automatische Warenausgang beim Verkauf sowie
// die Korrektur-Gegenbuchung bei einem Storno - Pendant zu
// repository._lagerbewegung_erfassen)
// ---------------------------------------------------------------------

async function lagerbewegungErfassen(produktId, typ, menge, kommentar, benutzerName, gid) {
  await put("lagerbewegungen", {
    id: neueId(),
    produkt_id: produktId,
    typ,
    menge,
    datum: jetzt(),
    kommentar,
    beleg_pfad: null,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    einzelpreis: null,
    mwst_satz: null,
    benutzer: benutzerName,
  });
}

// ---------------------------------------------------------------------
// Kassiervorgaenge (Verkauf + Bezahlen + Storno) - Pendant zu
// repository.kassiervorgang_abschliessen / vorgang_stornieren
// ---------------------------------------------------------------------

// warenkorb: Liste von {produktId, name, menge, einzelpreis, einkaufspreis,
// mwstSatz, istHelferpreis}.
export async function kassiervorgangAbschliessen(veranstaltung, warenkorb, gegeben, benutzerName) {
  if (!warenkorb.length) throw new Error("Warenkorb ist leer.");
  const gesamtbetrag = rund2(warenkorb.reduce((s, p) => s + p.menge * p.einzelpreis, 0));
  const rueckgeld = rund2(gegeben - gesamtbetrag);
  if (rueckgeld < 0) throw new Error("Gegebener Betrag ist kleiner als der Gesamtbetrag.");

  const vorgangId = neueId();
  const datum = jetzt();
  const gid = await geraetId();

  await put("kassiervorgaenge", {
    id: vorgangId,
    datum,
    veranstaltung,
    gesamtbetrag,
    gegeben,
    rueckgeld,
    storno_von: null,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
  });

  for (const position of warenkorb) {
    await put("positionen", {
      id: neueId(),
      vorgang_id: vorgangId,
      produkt_id: position.produktId,
      menge: position.menge,
      einzelpreis: position.einzelpreis,
      einkaufspreis: position.einkaufspreis,
      mwst_satz: position.mwstSatz,
      ist_helferpreis: position.istHelferpreis ? 1 : 0,
      geraet_id: gid,
      synced: false,
      synced_at: null,
    });
    await lagerbewegungErfassen(
      position.produktId,
      "Warenausgang",
      -position.menge,
      `Verkauf (${veranstaltung})`,
      benutzerName,
      gid
    );
  }
  return { vorgangId, gesamtbetrag, rueckgeld };
}

export async function letzteVorgaenge(limit = 30) {
  const alle = await getAll("kassiervorgaenge");
  return alle.sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, limit);
}

export async function positionenFuerVorgang(vorgangId) {
  const alle = await getAll("positionen");
  return alle.filter((p) => p.vorgang_id === vorgangId);
}

export async function vorgangIstStorniert(vorgangId) {
  const alle = await getAll("kassiervorgaenge");
  return alle.some((v) => v.storno_von === vorgangId);
}

export async function vorgangStornieren(vorgangId, benutzerName, kommentar = null) {
  const vorgang = await get("kassiervorgaenge", vorgangId);
  if (!vorgang) throw new Error("Vorgang nicht gefunden.");
  if (vorgang.storno_von) throw new Error("Ein Storno-Vorgang kann nicht erneut storniert werden.");
  if (await vorgangIstStorniert(vorgangId)) {
    throw new Error("Dieser Vorgang wurde bereits storniert.");
  }

  const positionen = await positionenFuerVorgang(vorgangId);
  const stornoId = neueId();
  const datum = jetzt();
  const gid = await geraetId();

  await put("kassiervorgaenge", {
    id: stornoId,
    datum,
    veranstaltung: vorgang.veranstaltung,
    gesamtbetrag: -vorgang.gesamtbetrag,
    gegeben: null,
    rueckgeld: null,
    storno_von: vorgangId,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
  });

  for (const pos of positionen) {
    await put("positionen", {
      id: neueId(),
      vorgang_id: stornoId,
      produkt_id: pos.produkt_id,
      menge: -pos.menge,
      einzelpreis: pos.einzelpreis,
      einkaufspreis: pos.einkaufspreis,
      mwst_satz: pos.mwst_satz,
      ist_helferpreis: pos.ist_helferpreis,
      geraet_id: gid,
      synced: false,
      synced_at: null,
    });
    await lagerbewegungErfassen(
      pos.produkt_id,
      "Korrektur",
      pos.menge,
      kommentar || `Storno zu Vorgang ${vorgangId}`,
      benutzerName,
      gid
    );
  }
  return stornoId;
}

// ---------------------------------------------------------------------
// Kassensturz (mit explizitem Anfangsbestand / Wechselgeld) - Pendant zu
// repository.letzter_kassensturz / kassensturz_vorschau /
// kassensturz_durchfuehren
// ---------------------------------------------------------------------

export async function letzterKassensturz(veranstaltung) {
  const alle = await getAll("kassenstuerze");
  const passende = alle
    .filter((k) => k.veranstaltung === veranstaltung)
    .sort((a, b) => (a.datum < b.datum ? 1 : -1));
  return passende[0] ?? null;
}

async function schiedsrichterAuszahlungenSumme(veranstaltung, seit) {
  const alle = await getAll("schiedsrichter_auszahlungen");
  const summe = alle
    .filter((a) => a.veranstaltung === veranstaltung && a.datum > seit)
    .reduce((s, a) => s + a.betrag, 0);
  return rund2(summe);
}

export async function kassensturzVorschau(veranstaltung) {
  const letzter = await letzterKassensturz(veranstaltung);
  const anfangsbestand = letzter ? letzter.naechster_startbetrag : 0.0;
  const seit = letzter ? letzter.datum : "0000-01-01T00:00:00+00:00";

  const alleVorgaenge = await getAll("kassiervorgaenge");
  const einnahmen = rund2(
    alleVorgaenge
      .filter((v) => v.veranstaltung === veranstaltung && v.datum > seit)
      .reduce((s, v) => s + v.gesamtbetrag, 0)
  );
  const auszahlungen = await schiedsrichterAuszahlungenSumme(veranstaltung, seit);

  return {
    istErsterKassensturz: letzter === null,
    anfangsbestand: rund2(anfangsbestand),
    einnahmen,
    auszahlungen,
    soll: rund2(anfangsbestand + einnahmen - auszahlungen),
  };
}

export async function kassensturzDurchfuehren(
  veranstaltung,
  gezaehlterBetrag,
  naechsterStartbetrag,
  anfangsbestandOverride,
  benutzerName
) {
  const vorschau = await kassensturzVorschau(veranstaltung);
  const anfangsbestand = anfangsbestandOverride ?? vorschau.anfangsbestand;
  const soll = rund2(anfangsbestand + vorschau.einnahmen - vorschau.auszahlungen);
  const differenz = rund2(gezaehlterBetrag - soll);
  const ksId = neueId();
  const gid = await geraetId();

  await put("kassenstuerze", {
    id: ksId,
    datum: jetzt(),
    veranstaltung,
    anfangsbestand,
    erwarteter_betrag: soll,
    gezaehlter_betrag: gezaehlterBetrag,
    differenz,
    naechster_startbetrag: naechsterStartbetrag,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
  });
  return { ksId, soll, differenz };
}

export async function kassensturzHistorie(limit = 30) {
  const alle = await getAll("kassenstuerze");
  return alle.sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, limit);
}
