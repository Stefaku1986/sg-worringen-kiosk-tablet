// Geschaeftslogik der Tablet-Kasse - Pendant zu kiosk/repository.py,
// beschraenkt auf das, was auf dem Tablet gebraucht wird: Verkauf +
// automatischer Warenausgang, Storno, Kassensturz sowie
// Schiedsrichter-Auszahlungen und Bargeld-Einzahlungen (je erfassen +
// stornieren). Produktverwaltung, Benutzerverwaltung, uebrige
// Warenwirtschaft (Wareneingang/Korrektur/Inventur/Beleg-Scan),
// Auswertung/Monatsabrechnung und Drucken bleiben bewusst der Windows-App
// vorbehalten - hier werden die dafuer noetigen Tabellen nur mitgelesen
// (siehe sync.js).
//
// Wie am Rechner sind Kassiervorgaenge, Positionen, Lagerbewegungen,
// Kassenstuerze, Schiedsrichter-Auszahlungen und Bargeld-Einzahlungen
// unveraenderliche Ereignisse: sie werden nur angelegt, nie nachtraeglich
// veraendert oder geloescht. Ein Storno legt einen neuen, gegenlaeufigen
// Vorgang an statt den Original-Vorgang zu veraendern.

import { getAll, get, put, geraetId, jetzt, neueId } from "./db.js";
import { GERAET_NAME, PFAND_RUECKGABE_PRODUKT_ID } from "./config.js";
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

// Das feste Pseudo-Produkt fuer die Ein-Klick-Pfandrückgabe (siehe
// PFAND_RUECKGABE_PRODUKT_ID in config.js). undefined, falls es lokal noch
// nicht synchronisiert wurde.
export async function pfandPauschalProdukt() {
  return get("produkte", PFAND_RUECKGABE_PRODUKT_ID);
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
// Lagerbewegungen - urspruenglich nur der automatische Warenausgang beim
// Verkauf sowie die Korrektur-Gegenbuchung bei einem Storno (Pendant zu
// repository._lagerbewegung_erfassen); seit den erweiterten
// Nachbestellungen (siehe unten) bucht das Tablet darueber auch echte
// Wareneingaenge, optional mit Preis/MwSt.-Satz - deshalb jetzt exportiert
// und mit denselben optionalen Preis-Parametern wie am Rechner.
// ---------------------------------------------------------------------

export async function lagerbewegungErfassen(
  produktId,
  typ,
  menge,
  kommentar,
  benutzerName,
  gid,
  einzelpreis = null,
  mwstSatz = null
) {
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
    einzelpreis,
    mwst_satz: mwstSatz,
    benutzer: benutzerName,
  });
}

// ---------------------------------------------------------------------
// Kassiervorgaenge (Verkauf + Bezahlen + Storno) - Pendant zu
// repository.kassiervorgang_abschliessen / vorgang_stornieren
// ---------------------------------------------------------------------

// warenkorb: Liste von {produktId, name, menge, einzelpreis, einkaufspreis,
// mwstSatz, istHelferpreis, pfandBetrag, istPfandrueckgabe}. pfandBetrag
// (pro Stueck, 0 falls kein Pfand) fliesst mit in den Gesamtbetrag ein -
// das Pfand landet real in der Kasse und muss beim Kassensturz genauso
// mitgezaehlt werden wie der eigentliche Warenerloes (Pendant zu
// repository.kassiervorgang_abschliessen). Eine Pfandrueckgabe-Position
// (istPfandrueckgabe = true, siehe main.js "Pfand zurueckgeben"-Knopf) hat
// einzelpreis = 0 und einen NEGATIVEN pfandBetrag - sie mindert den
// Gesamtbetrag dadurch automatisch, ohne dass an dieser Berechnung etwas
// geaendert werden musste. Sie bucht bewusst KEINEN Warenausgang: das
// Zurueckbringen einer leeren Flasche ist kein Lagerbestands-Ereignis fuer
// das Getraenk, sondern eine reine Bargeld-Rueckzahlung.
export async function kassiervorgangAbschliessen(veranstaltung, warenkorb, gegeben, benutzerName) {
  if (!warenkorb.length) throw new Error("Warenkorb ist leer.");
  const gesamtbetrag = rund2(
    warenkorb.reduce((s, p) => s + p.menge * (p.einzelpreis + (p.pfandBetrag || 0)), 0)
  );
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
      pfand_betrag: position.pfandBetrag || 0,
      ist_pfandrueckgabe: position.istPfandrueckgabe ? 1 : 0,
      geraet_id: gid,
      synced: false,
      synced_at: null,
    });
    if (position.istPfandrueckgabe) continue;
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
      pfand_betrag: pos.pfand_betrag || 0,
      ist_pfandrueckgabe: pos.ist_pfandrueckgabe || 0,
      geraet_id: gid,
      synced: false,
      synced_at: null,
    });
    if (pos.ist_pfandrueckgabe) continue;
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
// Schiedsrichter-Auszahlungen - Pendant zu
// repository.schiedsrichter_auszahlung_erfassen /
// schiedsrichter_auszahlung_stornieren. Wie ein Kassiervorgang ein
// unveraenderliches Ereignis - eine Korrektur erfolgt ausschliesslich per
// Storno, nie durch Aendern/Loeschen. Mindert das Bargeld in der Kasse
// (siehe Kassensturz-Soll oben), ist aber kein Wareneinsatz.
// ---------------------------------------------------------------------

// Runde 33: kostenlosProduktId/kostenlosMenge sind optional - kostenlose
// Artikel (z.B. Wasser), die zusaetzlich zum/statt des Bargelds an den
// Schiedsrichter gegeben werden. Bucht automatisch eine Bestandskorrektur
// (typ="Korrektur", wie bei Schwund/Bruch am Rechner) ueber die bereits
// vorhandene lagerbewegungErfassen() - eine bewusste, kleine Ausnahme von
// der oben beschriebenen Regel "uebrige Warenwirtschaft bleibt der
// Windows-App vorbehalten", analog zur bestehenden Ausnahme fuer
// Nachbestellungen. Mindert NICHT das erwartete Bargeld (nur betrag tut
// das) - eine Auszahlung kann daher aus reinem Bargeld, reinen kostenlosen
// Artikeln (betrag=0) oder beidem bestehen; mindestens eines von beidem
// ist erforderlich.
export async function schiedsrichterAuszahlungErfassen(
  veranstaltung,
  betrag,
  mannschaft,
  schiedsrichterName,
  kommentar,
  benutzerName,
  kostenlosProduktId = null,
  kostenlosMenge = null
) {
  const hatKostenloseArtikel = kostenlosProduktId != null && !!kostenlosMenge;
  const betragWert = betrag == null ? 0 : betrag;
  if (betragWert < 0) throw new Error("Betrag darf nicht negativ sein.");
  if (hatKostenloseArtikel && kostenlosMenge <= 0) {
    throw new Error("Menge der kostenlosen Artikel muss größer als 0 sein.");
  }
  if (betragWert <= 0 && !hatKostenloseArtikel) {
    throw new Error("Bitte einen Betrag größer als 0 und/oder kostenlose Artikel angeben.");
  }
  const id = neueId();
  const gid = await geraetId();
  await put("schiedsrichter_auszahlungen", {
    id,
    datum: jetzt(),
    veranstaltung,
    mannschaft: mannschaft || null,
    schiedsrichter_name: schiedsrichterName || null,
    betrag: rund2(betragWert),
    kommentar: kommentar || null,
    storno_von: null,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
    kostenlos_produkt_id: hatKostenloseArtikel ? kostenlosProduktId : null,
    kostenlos_menge: hatKostenloseArtikel ? kostenlosMenge : null,
  });
  if (hatKostenloseArtikel) {
    let kbKommentar = "Kostenlose Ausgabe an Schiedsrichter";
    if (mannschaft) kbKommentar += ` (${mannschaft})`;
    if (schiedsrichterName) kbKommentar += ` – ${schiedsrichterName}`;
    await lagerbewegungErfassen(
      kostenlosProduktId, "Korrektur", -kostenlosMenge, kbKommentar, benutzerName, gid
    );
  }
  return id;
}

export async function letzteSchiedsrichterAuszahlungen(limit = 30) {
  const alle = await getAll("schiedsrichter_auszahlungen");
  return alle.sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, limit);
}

export async function schiedsrichterAuszahlungIstStorniert(auszahlungId) {
  const alle = await getAll("schiedsrichter_auszahlungen");
  return alle.some((a) => a.storno_von === auszahlungId);
}

export async function schiedsrichterAuszahlungStornieren(auszahlungId, benutzerName, kommentar = null) {
  const auszahlung = await get("schiedsrichter_auszahlungen", auszahlungId);
  if (!auszahlung) throw new Error("Auszahlung nicht gefunden.");
  if (auszahlung.storno_von) throw new Error("Eine Storno-Auszahlung kann nicht erneut storniert werden.");
  if (await schiedsrichterAuszahlungIstStorniert(auszahlungId)) {
    throw new Error("Diese Auszahlung wurde bereits storniert.");
  }
  const stornoId = neueId();
  const gid = await geraetId();
  await put("schiedsrichter_auszahlungen", {
    id: stornoId,
    datum: jetzt(),
    veranstaltung: auszahlung.veranstaltung,
    mannschaft: auszahlung.mannschaft,
    schiedsrichter_name: auszahlung.schiedsrichter_name,
    betrag: -auszahlung.betrag,
    kommentar: kommentar || `Storno zu Auszahlung ${auszahlungId}`,
    storno_von: auszahlungId,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
    // Runde 33: unveraendert uebernommen (nur fuer die Anzeige) - der
    // tatsaechliche Bestand kommt ueber die separate Korrektur-Buchung
    // unten zurueck.
    kostenlos_produkt_id: auszahlung.kostenlos_produkt_id ?? null,
    kostenlos_menge: auszahlung.kostenlos_menge ?? null,
  });
  if (auszahlung.kostenlos_produkt_id && auszahlung.kostenlos_menge) {
    await lagerbewegungErfassen(
      auszahlung.kostenlos_produkt_id,
      "Korrektur",
      auszahlung.kostenlos_menge,
      kommentar || `Storno zu Auszahlung ${auszahlungId} (kostenlose Artikel)`,
      benutzerName,
      gid
    );
  }
  return stornoId;
}

// ---------------------------------------------------------------------
// Bargeld-Einzahlungen - Pendant zu
// repository.bargeld_einzahlung_erfassen / bargeld_einzahlung_stornieren.
// Gegenstueck zu den Schiedsrichter-Auszahlungen oben: erhoeht statt
// mindert das in der Kasse erwartete Bargeld (Kassensturz-Soll), z.B. fuer
// Wechselgeld-Nachschub oder einen Vorschuss fuer den Wareneinkauf. Wie
// dort ein unveraenderliches Ereignis - eine Korrektur erfolgt
// ausschliesslich per Storno, nie durch Aendern/Loeschen.
// ---------------------------------------------------------------------

export async function bargeldEinzahlungErfassen(veranstaltung, betrag, kommentar, benutzerName) {
  if (betrag == null || betrag <= 0) throw new Error("Betrag muss größer als 0 sein.");
  const id = neueId();
  const gid = await geraetId();
  await put("bargeld_einzahlungen", {
    id,
    datum: jetzt(),
    veranstaltung,
    betrag: rund2(betrag),
    kommentar: kommentar || null,
    storno_von: null,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
  });
  return id;
}

export async function letzteBargeldEinzahlungen(limit = 30) {
  const alle = await getAll("bargeld_einzahlungen");
  return alle.sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, limit);
}

export async function bargeldEinzahlungIstStorniert(einzahlungId) {
  const alle = await getAll("bargeld_einzahlungen");
  return alle.some((e) => e.storno_von === einzahlungId);
}

export async function bargeldEinzahlungStornieren(einzahlungId, benutzerName, kommentar = null) {
  const einzahlung = await get("bargeld_einzahlungen", einzahlungId);
  if (!einzahlung) throw new Error("Einzahlung nicht gefunden.");
  if (einzahlung.storno_von) throw new Error("Eine Storno-Einzahlung kann nicht erneut storniert werden.");
  if (await bargeldEinzahlungIstStorniert(einzahlungId)) {
    throw new Error("Diese Einzahlung wurde bereits storniert.");
  }
  const stornoId = neueId();
  const gid = await geraetId();
  await put("bargeld_einzahlungen", {
    id: stornoId,
    datum: jetzt(),
    veranstaltung: einzahlung.veranstaltung,
    betrag: -einzahlung.betrag,
    kommentar: kommentar || `Storno zu Einzahlung ${einzahlungId}`,
    storno_von: einzahlungId,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
  });
  return stornoId;
}

async function bargeldEinzahlungenSumme(veranstaltung, seit) {
  const alle = await getAll("bargeld_einzahlungen");
  const summe = alle
    .filter((e) => e.veranstaltung === veranstaltung && e.datum > seit)
    .reduce((s, e) => s + e.betrag, 0);
  return rund2(summe);
}

// ---------------------------------------------------------------------
// Sonstige Ausgaben - Pendant zu repository.sonstige_ausgabe_erfassen /
// sonstige_ausgabe_stornieren (Runde 27). Allgemeine Kiosk-Ausgaben (z.B.
// Reinigungsmittel, Reparaturen, Material) - AUSDRUECKLICH OHNE Strom,
// dafuer zahlt der Verein nicht. Wie eine Schiedsrichter-Auszahlung ein
// unveraenderliches Ereignis - eine Korrektur erfolgt ausschliesslich per
// Storno, nie durch Aendern/Loeschen.
// ---------------------------------------------------------------------

export async function sonstigeAusgabeErfassen(veranstaltung, betrag, beschreibung, benutzerName) {
  if (betrag == null || betrag <= 0) throw new Error("Betrag muss größer als 0 sein.");
  if (!beschreibung || !beschreibung.trim()) throw new Error("Beschreibung ist erforderlich.");
  const id = neueId();
  const gid = await geraetId();
  await put("sonstige_ausgaben", {
    id,
    datum: jetzt(),
    veranstaltung,
    betrag: rund2(betrag),
    beschreibung: beschreibung.trim(),
    storno_von: null,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
  });
  return id;
}

export async function letzteSonstigeAusgaben(limit = 30) {
  const alle = await getAll("sonstige_ausgaben");
  return alle.sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, limit);
}

export async function sonstigeAusgabeIstStorniert(ausgabeId) {
  const alle = await getAll("sonstige_ausgaben");
  return alle.some((a) => a.storno_von === ausgabeId);
}

export async function sonstigeAusgabeStornieren(ausgabeId, benutzerName, kommentar = null) {
  const ausgabe = await get("sonstige_ausgaben", ausgabeId);
  if (!ausgabe) throw new Error("Ausgabe nicht gefunden.");
  if (ausgabe.storno_von) throw new Error("Eine Storno-Ausgabe kann nicht erneut storniert werden.");
  if (await sonstigeAusgabeIstStorniert(ausgabeId)) {
    throw new Error("Diese Ausgabe wurde bereits storniert.");
  }
  const stornoId = neueId();
  const gid = await geraetId();
  await put("sonstige_ausgaben", {
    id: stornoId,
    datum: jetzt(),
    veranstaltung: ausgabe.veranstaltung,
    betrag: -ausgabe.betrag,
    beschreibung: ausgabe.beschreibung,
    storno_von: ausgabeId,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
  });
  return stornoId;
}

async function sonstigeAusgabenSumme(veranstaltung, seit) {
  const alle = await getAll("sonstige_ausgaben");
  const summe = alle
    .filter((a) => a.veranstaltung === veranstaltung && a.datum > seit)
    .reduce((s, a) => s + a.betrag, 0);
  return rund2(summe);
}

// ---------------------------------------------------------------------
// Bargeld-Entnahmen - Pendant zu repository.bargeld_entnahme_erfassen /
// bargeld_entnahme_stornieren (Runde 27). Dokumentiert, wer Bargeld aus
// der Kasse erhalten hat (Pflichtfeld Empfaenger). WICHTIG: kassensturzId
// nur setzen, wenn diese Entnahme den beim Kassensturz gezaehlten
// Ueberschuss abbildet - eine so verknuepfte Entnahme ist rein informativ
// und mindert das kuenftige Kassensturz-Soll NICHT zusaetzlich, weil dieser
// Ueberschuss bereits ueber den Anfangsbestand-Uebertrag (naechsterStartbetrag)
// aus dem Soll ausgeschlossen ist (siehe kassensturzVorschau/
// bargeldEntnahmenAdhocSumme unten). Nur echte Ad-hoc-Entnahmen zwischen
// zwei Kassenstuerzen (kassensturzId nicht gesetzt) mindern das Soll
// tatsaechlich. Wie eine Schiedsrichter-Auszahlung ein unveraenderliches
// Ereignis - eine Korrektur erfolgt ausschliesslich per Storno.
// ---------------------------------------------------------------------

export async function bargeldEntnahmeErfassen(
  veranstaltung,
  betrag,
  empfaenger,
  kommentar,
  benutzerName,
  kassensturzId = null
) {
  if (betrag == null || betrag <= 0) throw new Error("Betrag muss größer als 0 sein.");
  if (!empfaenger || !empfaenger.trim()) throw new Error("Empfänger ist erforderlich.");
  const id = neueId();
  const gid = await geraetId();
  await put("bargeld_entnahmen", {
    id,
    datum: jetzt(),
    veranstaltung,
    betrag: rund2(betrag),
    empfaenger: empfaenger.trim(),
    kommentar: kommentar || null,
    kassensturz_id: kassensturzId || null,
    storno_von: null,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
  });
  return id;
}

export async function letzteBargeldEntnahmen(limit = 30) {
  const alle = await getAll("bargeld_entnahmen");
  return alle.sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, limit);
}

export async function bargeldEntnahmeIstStorniert(entnahmeId) {
  const alle = await getAll("bargeld_entnahmen");
  return alle.some((e) => e.storno_von === entnahmeId);
}

export async function bargeldEntnahmeStornieren(entnahmeId, benutzerName, kommentar = null) {
  const entnahme = await get("bargeld_entnahmen", entnahmeId);
  if (!entnahme) throw new Error("Entnahme nicht gefunden.");
  if (entnahme.storno_von) throw new Error("Eine Storno-Entnahme kann nicht erneut storniert werden.");
  if (await bargeldEntnahmeIstStorniert(entnahmeId)) {
    throw new Error("Diese Entnahme wurde bereits storniert.");
  }
  const stornoId = neueId();
  const gid = await geraetId();
  await put("bargeld_entnahmen", {
    id: stornoId,
    datum: jetzt(),
    veranstaltung: entnahme.veranstaltung,
    betrag: -entnahme.betrag,
    empfaenger: entnahme.empfaenger,
    kommentar: kommentar || `Storno zu Entnahme ${entnahmeId}`,
    kassensturz_id: entnahme.kassensturz_id,
    storno_von: entnahmeId,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
  });
  return stornoId;
}

// Nur Entnahmen OHNE kassensturzId (echte Ad-hoc-Entnahmen zwischen zwei
// Kassenstuerzen) - siehe bargeldEntnahmeErfassen fuer die Begruendung,
// warum an einen Kassensturz gekoppelte Entnahmen hier bewusst NICHT
// mitgezaehlt werden (sonst Doppelzaehlung mit dem bereits per
// Anfangsbestand-Uebertrag ausgeschlossenen Ueberschuss).
async function bargeldEntnahmenAdhocSumme(veranstaltung, seit) {
  const alle = await getAll("bargeld_entnahmen");
  const summe = alle
    .filter((e) => e.veranstaltung === veranstaltung && e.datum > seit && !e.kassensturz_id)
    .reduce((s, e) => s + e.betrag, 0);
  return rund2(summe);
}

// ---------------------------------------------------------------------
// Lieferanten-Pfand (Nachbestellungen) - Pendant zu den entsprechenden
// repository.py-Funktionen. Pfand, das beim Nachbestellen von Getraenken
// beim Haendler bezahlt bzw. von ihm zurueckerhalten wird - bewusst
// getrennt vom Kunden-Pfand am Kiosk und ohne Kassenzuordnung (anders als
// bargeld_einzahlungen), da es nicht Teil des Kassenbestands ist. Nur fuer
// Administratoren nutzbar (siehe main.js). Wie Bargeld-Einzahlungen ein
// unveraenderliches Ereignis - eine Korrektur erfolgt ausschliesslich per
// Storno, nie durch Aendern/Loeschen.
// ---------------------------------------------------------------------

// positionen: optionale Liste von {produktId, menge, einzelpreis, mwstSatz,
// pfandBezahlt, pfandErhalten} - die nachbestellten Produkte (Getraenke UND
// Speisen), analog zu repository.lieferanten_pfand_erfassen. einzelpreis
// (Netto-Preis pro Stueck), mwstSatz und pfandBezahlt/pfandErhalten
// (jeweils PRO STUECK, Runde 32) sind optional; fuer jede Position mit
// menge > 0 wird zusaetzlich ein echter Wareneingang gebucht (siehe
// lagerbewegungErfassen oben) - der Warenbestand aktualisiert sich dadurch
// direkt. bezahlt/erhalten hier sind bereits die GESAMTSUMME inkl. eines
// etwaigen Pfand-Anteils aus den Positionen (der Aufrufer in main.js
// rechnet Positions-Pfand * Menge bereits mit ein) - diese Funktion
// speichert das Positions-Pfand nur zusaetzlich (pro Stueck) fuer die
// Anzeige je Produkt.
export async function lieferantenPfandErfassen(
  bezahlt,
  erhalten,
  kommentar,
  benutzerName,
  positionen = []
) {
  bezahlt = rund2(bezahlt || 0);
  erhalten = rund2(erhalten || 0);
  positionen = (positionen || []).filter((p) => p.menge);
  if (bezahlt === 0 && erhalten === 0 && positionen.length === 0) {
    throw new Error(
      "Bitte mindestens einen Betrag (bezahlt/zurückerhalten) oder eine " +
        "Produktposition angeben."
    );
  }
  const id = neueId();
  const gid = await geraetId();
  await put("lieferanten_pfand", {
    id,
    datum: jetzt(),
    bezahlt,
    erhalten,
    kommentar: kommentar || null,
    storno_von: null,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
  });
  for (const position of positionen) {
    await put("nachbestellung_positionen", {
      id: neueId(),
      nachbestellung_id: id,
      produkt_id: position.produktId,
      menge: position.menge,
      einzelpreis: position.einzelpreis ?? null,
      mwst_satz: position.mwstSatz ?? null,
      pfand_bezahlt: position.pfandBezahlt ?? null,
      pfand_erhalten: position.pfandErhalten ?? null,
      geraet_id: gid,
      synced: false,
      synced_at: null,
    });
    await lagerbewegungErfassen(
      position.produktId,
      "Wareneingang",
      position.menge,
      kommentar || "Nachbestellung",
      benutzerName,
      gid,
      position.einzelpreis ?? null,
      position.mwstSatz ?? null
    );
  }
  return id;
}

export async function letzteLieferantenPfandEintraege(limit = 30) {
  const alle = await getAll("lieferanten_pfand");
  return alle.sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, limit);
}

export async function nachbestellungPositionen(nachbestellungId) {
  const alle = await getAll("nachbestellung_positionen");
  return alle.filter((p) => p.nachbestellung_id === nachbestellungId);
}

export async function lieferantenPfandIstStorniert(eintragId) {
  const alle = await getAll("lieferanten_pfand");
  return alle.some((e) => e.storno_von === eintragId);
}

export async function lieferantenPfandStornieren(eintragId, benutzerName, kommentar = null) {
  const eintrag = await get("lieferanten_pfand", eintragId);
  if (!eintrag) throw new Error("Eintrag nicht gefunden.");
  if (eintrag.storno_von) throw new Error("Ein Storno-Eintrag kann nicht erneut storniert werden.");
  if (await lieferantenPfandIstStorniert(eintragId)) {
    throw new Error("Dieser Eintrag wurde bereits storniert.");
  }
  const positionen = await nachbestellungPositionen(eintragId);
  const stornoId = neueId();
  const gid = await geraetId();
  const stornoKommentar = kommentar || `Storno zu Nachbestellung ${eintragId}`;
  await put("lieferanten_pfand", {
    id: stornoId,
    datum: jetzt(),
    bezahlt: -eintrag.bezahlt,
    erhalten: -eintrag.erhalten,
    kommentar: stornoKommentar,
    storno_von: eintragId,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
  });
  for (const position of positionen) {
    await put("nachbestellung_positionen", {
      id: neueId(),
      nachbestellung_id: stornoId,
      produkt_id: position.produkt_id,
      menge: -position.menge,
      einzelpreis: position.einzelpreis,
      mwst_satz: position.mwst_satz,
      pfand_bezahlt: position.pfand_bezahlt ?? null,
      pfand_erhalten: position.pfand_erhalten ?? null,
      geraet_id: gid,
      synced: false,
      synced_at: null,
    });
    await lagerbewegungErfassen(
      position.produkt_id,
      "Korrektur",
      -position.menge,
      stornoKommentar,
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
  const sonstigeAusgaben = await sonstigeAusgabenSumme(veranstaltung, seit);
  const einzahlungen = await bargeldEinzahlungenSumme(veranstaltung, seit);
  const entnahmen = await bargeldEntnahmenAdhocSumme(veranstaltung, seit);

  return {
    istErsterKassensturz: letzter === null,
    anfangsbestand: rund2(anfangsbestand),
    einnahmen,
    auszahlungen,
    sonstigeAusgaben,
    einzahlungen,
    entnahmen,
    soll: rund2(
      anfangsbestand + einnahmen - auszahlungen - sonstigeAusgaben + einzahlungen - entnahmen
    ),
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
  const soll = rund2(
    anfangsbestand + vorschau.einnahmen - vorschau.auszahlungen - vorschau.sonstigeAusgaben
      + vorschau.einzahlungen - vorschau.entnahmen
  );
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

// ---------------------------------------------------------------------
// Kassenvorschlag (Trainingsplan + Heimspiele) - schlaegt anhand der
// aktuellen Uhrzeit vor, welche Kasse vermutlich gerade gebraucht wird.
// Schaltet NIE selbststaendig um, nur main.js zeigt anhand des
// Rueckgabewerts einen Vorschlag mit Bestaetigen/Verwerfen-Knopf an - wer
// kassiert, behaelt immer die Kontrolle. Trainingszeiten kommen aus einer
// festen woechentlichen Struktur (siehe sync.js, reine Lesekopie).
// Heimspiele werden von den Nutzer:innen selbst eingetragen, weil
// fussball.de bewusst gegen automatisiertes Auslesen der Spieltermine
// geschuetzt ist (verschleierte Mannschafts-/Datumsangaben im Daten-
// Feed) - das haben wir nicht umgangen.
// ---------------------------------------------------------------------

function lokalesDatumIso(d) {
  const jahr = d.getFullYear();
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  const tag = String(d.getDate()).padStart(2, "0");
  return `${jahr}-${monat}-${tag}`;
}

function zuMinuten(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Heimspiel-Ende ohne Angabe: grob geschaetzt als Anstoss + 2 Stunden
// (Spiel inkl. Nachspielzeit/Halbzeit plus etwas Kassenbetrieb danach).
const HEIMSPIEL_STANDARDDAUER_MINUTEN = 120;

export async function empfohleneKasse(jetztDatum = new Date()) {
  const wochentagJs = jetztDatum.getDay(); // 0=So..6=Sa
  const wochentag = wochentagJs === 0 ? 7 : wochentagJs; // 1=Mo..7=So
  const minutenJetzt = jetztDatum.getHours() * 60 + jetztDatum.getMinutes();
  const heute = lokalesDatumIso(jetztDatum);

  // Heimspiele haben Vorrang vor Training: konkretes Einzelereignis statt
  // wiederkehrender Regel.
  const heimspiele = await getAll("heimspiele");
  for (const spiel of heimspiele.filter((s) => s.datum === heute)) {
    const start = zuMinuten(spiel.start_uhrzeit);
    const ende = spiel.ende_uhrzeit ? zuMinuten(spiel.ende_uhrzeit) : start + HEIMSPIEL_STANDARDDAUER_MINUTEN;
    if (minutenJetzt >= start && minutenJetzt <= ende) {
      return {
        kasse: spiel.kasse,
        grund: `Heimspiel ${spiel.team}${spiel.gegner ? " vs. " + spiel.gegner : ""}`,
        schluessel: `heimspiel:${spiel.id}`,
      };
    }
  }

  const trainingszeiten = await getAll("trainingszeiten");
  for (const training of trainingszeiten.filter((t) => t.aktiv && t.wochentag === wochentag)) {
    const start = zuMinuten(training.start_uhrzeit);
    const ende = zuMinuten(training.ende_uhrzeit);
    if (minutenJetzt >= start && minutenJetzt <= ende) {
      return {
        kasse: training.kasse,
        grund: `Training ${training.team}`,
        schluessel: `training:${training.id}`,
      };
    }
  }

  return null;
}

export async function listeTrainingszeiten() {
  const alle = await getAll("trainingszeiten");
  return alle
    .filter((t) => t.aktiv)
    .sort((a, b) => a.wochentag - b.wochentag || a.start_uhrzeit.localeCompare(b.start_uhrzeit));
}

export async function heimspielEintragen(team, kasse, datum, startUhrzeit, endeUhrzeit, gegner, kommentar, benutzerName) {
  if (!team || !kasse || !datum || !startUhrzeit) {
    throw new Error("Team, Datum und Anstoßzeit sind erforderlich.");
  }
  const id = neueId();
  const gid = await geraetId();
  await put("heimspiele", {
    id,
    team,
    kasse,
    datum,
    start_uhrzeit: startUhrzeit,
    ende_uhrzeit: endeUhrzeit || null,
    gegner: gegner || null,
    kommentar: kommentar || null,
    erstellt_am: jetzt(),
    erstellt_von: benutzerName,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
  });
  return id;
}

export async function listeKommendeHeimspiele(anzahlTage = 30) {
  const heute = new Date();
  const heuteIso = lokalesDatumIso(heute);
  const grenze = new Date(heute);
  grenze.setDate(grenze.getDate() + anzahlTage);
  const grenzeIso = lokalesDatumIso(grenze);

  const alle = await getAll("heimspiele");
  return alle
    .filter((s) => s.datum >= heuteIso && s.datum <= grenzeIso)
    .sort((a, b) => (a.datum + a.start_uhrzeit).localeCompare(b.datum + b.start_uhrzeit));
}

// ---------------------------------------------------------------------
// Feedback (Funktions-/Produktwuensche) - Pendant zu kiosk/repository.py,
// Abschnitt "Feedback". Offenes Ideen-Board: alle Benutzer sehen alle
// Eintraege (siehe main.js), nicht nur die eigenen. Anders als z.B.
// Kassiervorgaenge eine ganz normale mutable Aktualisierung (status/
// antwort werden nachtraeglich per put() ueberschrieben, kein eigenes
// Storno-Konzept), genau wie benutzer.ist_admin/aktiv.
// ---------------------------------------------------------------------

export async function feedbackEinreichen(kategorie, text, benutzerName) {
  const getrimmt = (text || "").trim();
  if (!kategorie || !getrimmt) {
    throw new Error("Kategorie und Text sind erforderlich.");
  }
  const id = neueId();
  const gid = await geraetId();
  await put("feedback", {
    id,
    kategorie,
    text: getrimmt,
    ersteller: benutzerName || null,
    erstellt_am: jetzt(),
    status: "offen",
    antwort: null,
    beantwortet_von: null,
    beantwortet_am: null,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
  });
  return id;
}

export async function listeFeedback() {
  const alle = await getAll("feedback");
  return alle.sort((a, b) => (a.erstellt_am < b.erstellt_am ? 1 : -1));
}

export async function feedbackStatusSetzen(feedbackId, status, antwort, benutzerName) {
  const gueltig = ["offen", "in_bearbeitung", "erledigt", "abgelehnt"];
  if (!gueltig.includes(status)) {
    throw new Error("Ungültiger Status.");
  }
  const eintrag = await get("feedback", feedbackId);
  if (!eintrag) {
    throw new Error("Feedback-Eintrag wurde nicht gefunden.");
  }
  const gid = await geraetId();
  await put("feedback", {
    ...eintrag,
    status,
    antwort: (antwort || "").trim() || null,
    beantwortet_von: benutzerName || null,
    beantwortet_am: jetzt(),
    geraet_id: gid,
    synced: false,
    synced_at: null,
  });
}
