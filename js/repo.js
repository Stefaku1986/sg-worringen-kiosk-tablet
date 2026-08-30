// Geschaeftslogik der Tablet-Kasse - Pendant zu kiosk/repository.py.
// Seit Runde 43 deckt das Tablet denselben Funktionsumfang wie die
// Windows-App ab: Verkauf + automatischer Warenausgang, Storno,
// Kassensturz, Schiedsrichter-Auszahlungen, Bargeld-Einzahlungen, die
// uebrige Warenwirtschaft (Wareneingang/Korrektur/Inventur/Abschreibungen/
// Beleg-Foto), Produktverwaltung, Benutzerverwaltung sowie Auswertung/
// Monatsabrechnung (Drucken laeuft auf dem Tablet ueber den Browser-Druck
// statt Qt, siehe main.js druckenOeffnen()). Vorher waren diese Bereiche
// bewusst der Windows-App vorbehalten (siehe Projekt-Status-Dokument,
// Runde 43 - "Tablet um Windows-Funktionen erweitern").
//
// Wie am Rechner sind Kassiervorgaenge, Positionen, Lagerbewegungen,
// Kassenstuerze, Schiedsrichter-Auszahlungen und Bargeld-Einzahlungen
// unveraenderliche Ereignisse: sie werden nur angelegt, nie nachtraeglich
// veraendert oder geloescht. Ein Storno legt einen neuen, gegenlaeufigen
// Vorgang an statt den Original-Vorgang zu veraendern. Produkte/Benutzer
// sind (wie am Rechner) per Audit-Trail-Prinzip nie hart loeschbar, nur
// deaktivierbar (Benutzer zusaetzlich wieder aktivierbar).

import { getAll, get, put, geraetId, jetzt, neueId } from "./db.js";
import { GERAET_NAME, PFAND_RUECKGABE_PRODUKT_ID, VERANSTALTUNGEN, MWST_SAETZE } from "./config.js";
import { rund2, mwstBetrag, lokalerMonat } from "./format.js";
import { pinPruefen, pinHashen } from "./auth.js";

// ---------------------------------------------------------------------
// Produkte - seit Runde 43 auch auf dem Tablet verwaltbar (Pendant zu
// repository.produkt_anlegen/produkt_aktualisieren/produkt_deaktivieren).
// Wie am Rechner: nie hart loeschen, nur deaktivieren (Audit-Trail-
// Prinzip) - dafuer gibt es bewusst KEINE produktAktivieren()-Funktion,
// analog zur Windows-App.
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

export async function produktAnlegen(
  name, kategorie, mwstSatz, einkaufspreis, verkaufspreis, helferpreis, pfandBetrag, benutzerName
) {
  const id = neueId();
  const gid = await geraetId();
  await put("produkte", {
    id,
    name: (name || "").trim(),
    kategorie,
    mwst_satz: mwstSatz,
    einkaufspreis: rund2(einkaufspreis || 0),
    verkaufspreis: rund2(verkaufspreis || 0),
    helferpreis: helferpreis == null ? rund2(verkaufspreis || 0) : rund2(helferpreis),
    pfand_betrag: rund2(pfandBetrag || 0),
    aktiv: true,
    aktualisiert_am: jetzt(),
    geraet_id: gid,
    synced: false,
    synced_at: null,
  });
  return id;
}

export async function produktAktualisieren(
  produktId, name, kategorie, mwstSatz, einkaufspreis, verkaufspreis, helferpreis, pfandBetrag
) {
  const produkt = await get("produkte", produktId);
  if (!produkt) throw new Error("Produkt nicht gefunden.");
  const gid = await geraetId();
  await put("produkte", {
    ...produkt,
    name: (name || "").trim(),
    kategorie,
    mwst_satz: mwstSatz,
    einkaufspreis: rund2(einkaufspreis || 0),
    verkaufspreis: rund2(verkaufspreis || 0),
    helferpreis: helferpreis == null ? rund2(verkaufspreis || 0) : rund2(helferpreis),
    pfand_betrag: rund2(pfandBetrag || 0),
    aktualisiert_am: jetzt(),
    geraet_id: gid,
    synced: false,
    synced_at: null,
  });
}

export async function produktDeaktivieren(produktId) {
  const produkt = await get("produkte", produktId);
  if (!produkt) throw new Error("Produkt nicht gefunden.");
  const gid = await geraetId();
  await put("produkte", {
    ...produkt,
    aktiv: false,
    aktualisiert_am: jetzt(),
    geraet_id: gid,
    synced: false,
    synced_at: null,
  });
}

export { MWST_SAETZE };

// ---------------------------------------------------------------------
// Benutzer - seit Runde 43 auch auf dem Tablet verwaltbar (Pendant zu
// repository.benutzer_anlegen/benutzer_aktualisieren/benutzer_pin_setzen/
// benutzer_deaktivieren/benutzer_aktivieren). Die Regel "mindestens ein
// aktiver Administrator" wird - wie am Rechner - NICHT hier im Backend
// erzwungen, sondern in main.js vor dem Aufruf geprueft (siehe
// anzahlAktiveAdmins unten).
// ---------------------------------------------------------------------

export async function listeBenutzer(nurAktive = true) {
  const alle = await getAll("benutzer");
  const gefiltert = nurAktive ? alle.filter((b) => b.aktiv) : alle;
  return gefiltert.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export async function anzahlAktiveAdmins(ausserId = null) {
  const alle = await getAll("benutzer");
  return alle.filter((b) => b.aktiv && b.ist_admin && b.id !== ausserId).length;
}

export async function benutzerAnmelden(benutzerId, pin) {
  const b = await get("benutzer", benutzerId);
  if (!b || !b.aktiv) return null;
  const ok = await pinPruefen(pin, b.pin_hash, b.pin_salt);
  return ok ? b : null;
}

export async function benutzerAnlegen(name, pin, istAdmin) {
  const { hash, salt } = await pinHashen(pin);
  const id = neueId();
  const gid = await geraetId();
  const jetztIso = jetzt();
  await put("benutzer", {
    id,
    name: (name || "").trim(),
    pin_hash: hash,
    pin_salt: salt,
    ist_admin: !!istAdmin,
    aktiv: true,
    erstellt_am: jetztIso,
    aktualisiert_am: jetztIso,
    geraet_id: gid,
    synced: false,
    synced_at: null,
  });
  return id;
}

export async function benutzerAktualisieren(benutzerId, name, istAdmin) {
  const benutzer = await get("benutzer", benutzerId);
  if (!benutzer) throw new Error("Benutzer nicht gefunden.");
  const gid = await geraetId();
  await put("benutzer", {
    ...benutzer,
    name: (name || "").trim(),
    ist_admin: !!istAdmin,
    aktualisiert_am: jetzt(),
    geraet_id: gid,
    synced: false,
    synced_at: null,
  });
}

export async function benutzerPinSetzen(benutzerId, neuerPin) {
  const benutzer = await get("benutzer", benutzerId);
  if (!benutzer) throw new Error("Benutzer nicht gefunden.");
  const { hash, salt } = await pinHashen(neuerPin);
  const gid = await geraetId();
  await put("benutzer", {
    ...benutzer,
    pin_hash: hash,
    pin_salt: salt,
    aktualisiert_am: jetzt(),
    geraet_id: gid,
    synced: false,
    synced_at: null,
  });
}

export async function benutzerDeaktivieren(benutzerId) {
  const benutzer = await get("benutzer", benutzerId);
  if (!benutzer) throw new Error("Benutzer nicht gefunden.");
  const gid = await geraetId();
  await put("benutzer", {
    ...benutzer,
    aktiv: false,
    aktualisiert_am: jetzt(),
    geraet_id: gid,
    synced: false,
    synced_at: null,
  });
}

export async function benutzerAktivieren(benutzerId) {
  const benutzer = await get("benutzer", benutzerId);
  if (!benutzer) throw new Error("Benutzer nicht gefunden.");
  const gid = await geraetId();
  await put("benutzer", {
    ...benutzer,
    aktiv: true,
    aktualisiert_am: jetzt(),
    geraet_id: gid,
    synced: false,
    synced_at: null,
  });
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
  mwstSatz = null,
  belegPfad = null,
  istAbschreibung = false,
  abschreibungGrund = null,
  stornoVon = null
) {
  const id = neueId();
  await put("lagerbewegungen", {
    id,
    produkt_id: produktId,
    typ,
    menge,
    datum: jetzt(),
    kommentar,
    beleg_pfad: belegPfad,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    einzelpreis,
    mwst_satz: mwstSatz,
    benutzer: benutzerName,
    // Runde 43: Abschreibungen (siehe kiosk/repository.py, Runde 42) -
    // ist_abschreibung/abschreibung_grund/storno_von sind bei einer
    // normalen Buchung immer false/null/null.
    ist_abschreibung: !!istAbschreibung,
    abschreibung_grund: abschreibungGrund,
    storno_von: stornoVon,
  });
  return id;
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
      // Runde 38 (Feedback #2): Kunde hatte bereits eine bezahlte
      // Pfandmarke - rein informativ, die Geldwirkung steckt schon in
      // pfand_betrag = 0 (siehe warenkorbPfandErlassUmschalten in main.js).
      pfand_erlassen: position.pfandErlassen ? 1 : 0,
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
      pfand_erlassen: pos.pfand_erlassen || 0,
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

// Runde 42: der Kommentar laesst sich - anders als Betrag/Mannschaft/
// kostenlose Artikel - direkt nachtraeglich aendern (analog zu
// feedbackStatusSetzen), da er reine Anmerkung ist, kein Geldbetrag.
export async function schiedsrichterAuszahlungKommentarSetzen(auszahlungId, kommentar) {
  const auszahlung = await get("schiedsrichter_auszahlungen", auszahlungId);
  if (!auszahlung) throw new Error("Auszahlung nicht gefunden.");
  const gid = await geraetId();
  await put("schiedsrichter_auszahlungen", {
    ...auszahlung,
    kommentar: (kommentar || "").trim() || null,
    geraet_id: gid,
    synced: false,
    synced_at: null,
  });
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
    // Runde 5 Schritt 5.1: Stornierung als negativer Wareneingang buchen
    // (nicht als Korrektur), damit Wareneinkauf und Vorsteuer korrekt sinken.
    // Mit denselben Preisangaben wie die Originalposition, sodass sich beide
    // aufheben (negative Menge x Einkaufspreis = Gegenbuchung).
    await lagerbewegungErfassen(
      position.produkt_id,
      "Wareneingang",
      -position.menge,
      stornoKommentar,
      benutzerName,
      gid,
      position.einzelpreis,
      position.mwst_satz
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

// Runde 37: EIN kombinierter Kassensturz ueber alle Kassen statt einem je
// Kasse (siehe kiosk/repository.py kassensturz_gesamt_vorschau/
// kassensturz_gesamt_durchfuehren, dort die ausfuehrliche Begruendung).
// Physisch gibt es nur eine gemeinsame Geldkasse - Jugend/Senioren bleibt
// als Buchungs-Kategorie fuer die Gewinnzuordnung bestehen, deshalb wird
// hier der EINE gezaehlte/naechste-Runde-Betrag anteilig nach Soll auf die
// einzelnen Kassen aufgeteilt und ganz normal ueber kassensturzDurchfuehren
// gebucht - Kassensturz-Historie und -Beleg bleiben dadurch unveraendert
// je Kasse nutzbar.
export async function kassensturzGesamtVorschau() {
  const kassen = [];
  for (const veranstaltung of VERANSTALTUNGEN) {
    const vorschau = await kassensturzVorschau(veranstaltung);
    vorschau.veranstaltung = veranstaltung;
    kassen.push(vorschau);
  }
  const summe = (feld) => rund2(kassen.reduce((s, k) => s + k[feld], 0));
  return {
    kassen,
    anfangsbestand: summe("anfangsbestand"),
    einnahmen: summe("einnahmen"),
    auszahlungen: summe("auszahlungen"),
    sonstigeAusgaben: summe("sonstigeAusgaben"),
    einzahlungen: summe("einzahlungen"),
    entnahmen: summe("entnahmen"),
    soll: summe("soll"),
  };
}

// Teilt einen Gesamtbetrag proportional nach Soll-Anteil auf die Kassen
// auf (physisch dasselbe Bargeld, keine echte Trennung moeglich). Bei
// Soll-Summe 0 wird gleichmaessig aufgeteilt. Eine Rundungsdifferenz
// (durch das Runden auf den Cent je Kasse) wird der Kasse mit dem
// groessten Anteil zugeschlagen, damit die Einzelbetraege in Summe exakt
// wieder den Gesamtbetrag ergeben.
function kassenanteileAufteilen(gesamtbetrag, kassenSoll) {
  const n = kassenSoll.length;
  if (n === 0) return [];
  const sollSumme = kassenSoll.reduce((s, x) => s + x, 0);
  const anteile = sollSumme
    ? kassenSoll.map((s) => s / sollSumme)
    : kassenSoll.map(() => 1 / n);
  const betraege = anteile.map((a) => rund2(gesamtbetrag * a));
  const rest = rund2(gesamtbetrag - betraege.reduce((s, b) => s + b, 0));
  if (rest) {
    let groessterIndex = 0;
    for (let i = 1; i < n; i++) {
      if (kassenSoll[i] > kassenSoll[groessterIndex]) groessterIndex = i;
    }
    betraege[groessterIndex] = rund2(betraege[groessterIndex] + rest);
  }
  return betraege;
}

// anfangsbestandOverrides: optionales Objekt {veranstaltung: betrag} fuer
// Kassen, die gerade ihren allerersten Kassensturz haben (siehe
// kassensturzVorschau().istErsterKassensturz) - fuer alle anderen Kassen
// wird der Anfangsbestand wie gewohnt automatisch aus der letzten Runde
// uebernommen. Die Soll-Formel je Kasse ist absichtlich identisch zu der
// in kassensturzDurchfuehren() dupliziert (nur fuer die Aufteilung nach
// Soll-Anteil benoetigt).
export async function kassensturzGesamtDurchfuehren(
  gezaehlterBetragGesamt,
  naechsterStartbetragGesamt,
  anfangsbestandOverrides,
  benutzerName
) {
  anfangsbestandOverrides = anfangsbestandOverrides || {};
  const vorschauGesamt = await kassensturzGesamtVorschau();

  const kassenSoll = vorschauGesamt.kassen.map((k) => {
    const override = anfangsbestandOverrides[k.veranstaltung];
    const anfangsbestand =
      k.istErsterKassensturz && override !== undefined && override !== null
        ? override
        : k.anfangsbestand;
    return rund2(
      anfangsbestand + k.einnahmen - k.auszahlungen - k.sonstigeAusgaben
        + k.einzahlungen - k.entnahmen
    );
  });

  const sollGesamt = rund2(kassenSoll.reduce((s, x) => s + x, 0));
  const gezaehltJeKasse = kassenanteileAufteilen(gezaehlterBetragGesamt, kassenSoll);
  const naechsterStartJeKasse = kassenanteileAufteilen(naechsterStartbetragGesamt, kassenSoll);

  const kassen = [];
  for (let i = 0; i < vorschauGesamt.kassen.length; i++) {
    const k = vorschauGesamt.kassen[i];
    const override = k.istErsterKassensturz ? anfangsbestandOverrides[k.veranstaltung] : undefined;
    const anfangsbestandOverride = override === undefined || override === null ? undefined : override;
    const ergebnis = await kassensturzDurchfuehren(
      k.veranstaltung,
      gezaehltJeKasse[i],
      naechsterStartJeKasse[i],
      anfangsbestandOverride,
      benutzerName
    );
    kassen.push({
      veranstaltung: k.veranstaltung,
      ksId: ergebnis.ksId,
      soll: ergebnis.soll,
      gezaehlterBetrag: gezaehltJeKasse[i],
      naechsterStartbetrag: naechsterStartJeKasse[i],
      differenz: ergebnis.differenz,
    });
  }

  return {
    kassen,
    soll: sollGesamt,
    gezaehlterBetrag: gezaehlterBetragGesamt,
    differenz: rund2(gezaehlterBetragGesamt - sollGesamt),
  };
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

// ---------------------------------------------------------------------
// Warenwirtschaft (Runde 43) - Pendant zu den entsprechenden
// repository.py-Funktionen (Bestand, Wareneingang/Korrektur, Inventur,
// Abschreibungen). Der Bestand ist wie am Rechner KEIN eigenes Feld,
// sondern immer die Summe aller lagerbewegungen.menge je Produkt (reine
// Ereignisquelle). Der Reiter "Warenwirtschaft" ist wie am Rechner NICHT
// admin-only - fuer alle angemeldeten Benutzer nutzbar (siehe
// _admin_sichtbarkeit_anwenden-Aequivalent in main.js, das nur Admin/
// Auswertung/Benutzer/Produkte-Verwaltung schuetzt).
// ---------------------------------------------------------------------

export async function bestandJeProdukt() {
  const alle = await getAll("lagerbewegungen");
  const bestand = {};
  for (const l of alle) {
    bestand[l.produkt_id] = (bestand[l.produkt_id] || 0) + l.menge;
  }
  return bestand;
}

export async function bestand(produktId) {
  const map = await bestandJeProdukt();
  return map[produktId] || 0;
}

async function bestandJeProduktZumZeitpunkt(zeitpunkt) {
  const alle = await getAll("lagerbewegungen");
  const bestand = {};
  for (const l of alle.filter((x) => x.datum <= zeitpunkt)) {
    bestand[l.produkt_id] = (bestand[l.produkt_id] || 0) + l.menge;
  }
  return bestand;
}

// zeitpunkt (optional, ISO-String): wie repository.warenbestand_bericht -
// ohne Angabe der aktuelle Bestand, sonst der Bestand zu diesem Zeitpunkt
// (z.B. fuer "Warenbestand zu diesem Kassensturz-Zeitpunkt"). Schliesst
// (wie am Rechner) das Pfandrueckgabe-Pseudoprodukt aus und zeigt ALLE
// Produkte (auch deaktivierte), sortiert nach Kategorie, Name.
export async function warenbestandBericht(zeitpunkt = null) {
  const produkte = await getAll("produkte");
  const bestandMap = zeitpunkt
    ? await bestandJeProduktZumZeitpunkt(zeitpunkt)
    : await bestandJeProdukt();
  return produkte
    .filter((p) => p.id !== PFAND_RUECKGABE_PRODUKT_ID)
    .map((p) => ({
      produkt_id: p.id,
      name: p.name,
      kategorie: p.kategorie,
      bestand: bestandMap[p.id] || 0,
    }))
    .sort((a, b) => a.kategorie.localeCompare(b.kategorie, "de") || a.name.localeCompare(b.name, "de"));
}

// zaehlungen: {produktId: gezaehlterBestand}. Bucht je Produkt mit
// Abweichung genau eine Korrektur-Lagerbewegung (Pendant zu
// repository.inventur_durchfuehren) - keine eigene Inventur-Tabelle, der
// Lagerbewegungsverlauf IST der Inventurverlauf. Liefert eine Zeile je
// UEBERGEBENEM Produkt zurueck (auch ohne Abweichung).
export async function inventurDurchfuehren(zaehlungen, kommentar, benutzerName) {
  const produkte = await getAll("produkte");
  const nameJeId = Object.fromEntries(produkte.map((p) => [p.id, p.name]));
  const bestandVor = await bestandJeProdukt();
  const gid = await geraetId();
  const jetztIso = jetzt();
  let hinweis = `Inventur vom ${datumLokal(jetztIso)}`;
  if (kommentar && kommentar.trim()) hinweis += ` – ${kommentar.trim()}`;
  const ergebnis = [];
  for (const [produktId, gezaehlt] of Object.entries(zaehlungen)) {
    const vorher = bestandVor[produktId] || 0;
    const differenz = gezaehlt - vorher;
    if (differenz !== 0) {
      await lagerbewegungErfassen(
        produktId, "Korrektur", differenz, hinweis, benutzerName, gid
      );
    }
    ergebnis.push({
      produkt_id: produktId,
      name: nameJeId[produktId] || "",
      bestand_vorher: vorher,
      gezaehlt,
      differenz,
    });
  }
  return ergebnis;
}

// ---------------------------------------------------------------------
// Abschreibungen (Runde 42 am Rechner, Runde 43 auch auf dem Tablet) -
// Pendant zu repository.abschreibung_erfassen/-stornieren/-ist_storniert/
// letzte_abschreibungen/abschreibungen_bericht. Technisch eine normale
// "Korrektur"-Lagerbewegung mit negativer Menge, zusaetzlich markiert
// (ist_abschreibung/abschreibung_grund) - Storno per Gegenbuchung
// (storno_von), Original bleibt unveraendert (siehe lagerbewegungErfassen
// oben).
// ---------------------------------------------------------------------

export const ABSCHREIBUNG_GRUENDE = ["Bruch", "Verderb/abgelaufen", "Diebstahl/Verlust", "Sonstiges"];

export async function abschreibungErfassen(produktId, menge, grund, kommentar, benutzerName) {
  if (menge == null || menge <= 0) throw new Error("Menge muss größer als 0 sein.");
  if (!ABSCHREIBUNG_GRUENDE.includes(grund)) throw new Error(`Unbekannter Grund: ${grund}`);
  const gid = await geraetId();
  return lagerbewegungErfassen(
    produktId, "Korrektur", -Math.abs(Math.trunc(menge)), kommentar || null, benutzerName, gid,
    null, null, null, true, grund, null
  );
}

export async function abschreibungIstStorniert(abschreibungId) {
  const alle = await getAll("lagerbewegungen");
  return alle.some((l) => l.storno_von === abschreibungId);
}

export async function abschreibungStornieren(abschreibungId, benutzerName, kommentar = null) {
  const original = await get("lagerbewegungen", abschreibungId);
  if (!original || !original.ist_abschreibung) throw new Error("Abschreibung nicht gefunden.");
  if (original.storno_von) {
    throw new Error("Eine Storno-Buchung kann nicht erneut storniert werden.");
  }
  if (await abschreibungIstStorniert(abschreibungId)) {
    throw new Error("Diese Abschreibung wurde bereits storniert.");
  }
  const gid = await geraetId();
  return lagerbewegungErfassen(
    original.produkt_id, "Korrektur", -original.menge,
    kommentar || `Storno zu Abschreibung ${abschreibungId}`, benutzerName, gid,
    null, null, null, true, original.abschreibung_grund, abschreibungId
  );
}

export async function letzteAbschreibungen(limit = 50) {
  const alle = await getAll("lagerbewegungen");
  const produkte = await getAll("produkte");
  const nameJeId = Object.fromEntries(produkte.map((p) => [p.id, p.name]));
  return alle
    .filter((l) => l.ist_abschreibung)
    .sort((a, b) => (a.datum < b.datum ? 1 : -1))
    .slice(0, limit)
    .map((l) => ({ ...l, produkt_name: nameJeId[l.produkt_id] || "" }));
}

// Gruppiert wie am Rechner nach (produkt_id, abschreibung_grund) - eine
// Storno-Gegenbuchung (positive Menge) hebt Menge/Wert in derselben Summe
// automatisch wieder auf. Nutzt immer den AKTUELLEN Einkaufspreis
// (Abschreibungen speichern keinen eigenen einzelpreis).
export async function abschreibungenBericht(jahr, monat) {
  const monatStr = `${String(jahr).padStart(4, "0")}-${String(monat).padStart(2, "0")}`;
  const alle = await getAll("lagerbewegungen");
  const produkte = await getAll("produkte");
  const produktJeId = Object.fromEntries(produkte.map((p) => [p.id, p]));
  const zeilen = alle.filter(
    (l) => l.ist_abschreibung && lokalerMonat(l.datum) === monatStr
  );
  const zwischenstand = {};
  for (const l of zeilen) {
    const p = produktJeId[l.produkt_id];
    if (!p) continue;
    const schluessel = `${l.produkt_id}::${l.abschreibung_grund || ""}`;
    const eintrag = zwischenstand[schluessel] || {
      produkt_id: l.produkt_id,
      name: p.name,
      grund: l.abschreibung_grund || "",
      menge: 0,
      wert: 0,
    };
    eintrag.menge = eintrag.menge - l.menge;
    eintrag.wert = rund2(eintrag.wert - l.menge * (p.einkaufspreis || 0));
    zwischenstand[schluessel] = eintrag;
  }
  return Object.values(zwischenstand).sort(
    (a, b) => a.name.localeCompare(b.name, "de") || a.grund.localeCompare(b.grund, "de")
  );
}

// Lokale Zeitformatierung - Pendant zu kiosk/format.py datum_lokal(),
// analog zum Windows-Fix aus Runde 41/42 (Anzeige in Systemzeit statt
// rohem UTC-Zeitstempel). Der ISO-String traegt bereits die UTC-
// Zeitzoneninfo, new Date(...) rechnet automatisch in die lokale
// Zeitzone des Geraets um.
export function datumLokal(isoDatum) {
  if (!isoDatum) return "";
  try {
    const d = new Date(isoDatum);
    if (Number.isNaN(d.getTime())) return isoDatum.slice(0, 16).replace("T", " ");
    const jahr = d.getFullYear();
    const monat = String(d.getMonth() + 1).padStart(2, "0");
    const tag = String(d.getDate()).padStart(2, "0");
    const stunde = String(d.getHours()).padStart(2, "0");
    const minute = String(d.getMinutes()).padStart(2, "0");
    return `${jahr}-${monat}-${tag} ${stunde}:${minute}`;
  } catch {
    return isoDatum.slice(0, 16).replace("T", " ");
  }
}

// ---------------------------------------------------------------------
// Auswertung / Monatsabrechnung (Runde 43, "Gewinn" ab Runde 44 ueber
// anteiligen Wareneinkauf statt Pro-Position-Einkaufspreis - siehe
// auswertungJeKasse()/monatsabrechnung() unten) - Pendant zu
// repository.auswertung_je_kasse/monatsabrechnung und den zugehoerigen
// Hilfsfunktionen. Rundungsstrategie: jede Zwischensumme wird nach jeder
// Positions-Zeile sofort auf 2 Nachkommastellen gerundet (rund2), analog
// zum Python-Original.
// ---------------------------------------------------------------------

// Ungenutzt seit Runde 44, bewusst stehen gelassen statt geloescht: der
// pro Position hinterlegte Einkaufspreis war nur eine grobe Schaetzung je
// Produkt, keine tatsaechlich gezahlte Nachbestellungs-Rechnung. Seit
// Runde 45 rechnet der Gewinn wieder pro verkaufter Position - aber mit
// dem ECHTEN Einkaufspreis aus den Wareneingaengen (siehe
// einkaufspreiseJeProdukt/wareneinsatzAusPositionen).
function berechneGewinnPosition(einzelpreis, einkaufspreis, mwstSatz) {
  const netto = rund2(einzelpreis - mwstBetrag(einzelpreis, mwstSatz));
  return rund2(netto - (einkaufspreis || 0));
}

// Runde 45: tatsaechlicher Netto-Einkaufspreis PRO STUECK je Produkt,
// mengengewichtet ueber alle Wareneingaenge MIT erfasstem Preis (Summe der
// Netto-Kosten / Summe der Stueckzahl). Pendant zu
// repository.einkaufspreise_je_produkt. Fallback wie dort: ohne einen
// einzigen preislich erfassten Wareneingang gilt der am Produkt
// hinterlegte einkaufspreis, sonst 0.
export async function einkaufspreiseJeProdukt() {
  const alle = await getAll("lagerbewegungen");
  const produkte = await getAll("produkte");
  const summen = {};
  for (const l of alle) {
    if (l.typ !== "Wareneingang") continue;
    // Ein erfasster Preis von 0,00 EUR ist kein realistischer
    // Einkaufspreis - wird deshalb wie nicht erfasst behandelt (Runde 46).
    if (l.einzelpreis == null || l.einzelpreis <= 0) continue;
    if (!(l.menge > 0)) continue;
    const eintrag = summen[l.produkt_id] || { menge: 0, netto: 0 };
    eintrag.menge += l.menge;
    eintrag.netto += l.einzelpreis * l.menge;
    summen[l.produkt_id] = eintrag;
  }
  const ergebnis = {};
  for (const p of produkte) {
    const eintrag = summen[p.id];
    ergebnis[p.id] = eintrag && eintrag.menge ? eintrag.netto / eintrag.menge : p.einkaufspreis || 0;
  }
  return ergebnis;
}

// Runde 45: Wareneinsatz je Kasse = Einkaufswert der tatsaechlich
// VERKAUFTEN Stuecke - Pendant zu repository._wareneinsatz_aus_positionen.
// Bewusst nicht der gesamte Wareneinkauf des Zeitraums (Runde 44): noch
// nicht verkaufte Ware ist Lagerbestand (siehe lagerwertGesamt), kein
// Verlust. Pfandrueckgabe-Positionen zaehlen nicht mit.
function wareneinsatzAusPositionen(positionen, preise) {
  const ergebnis = {};
  for (const v of VERANSTALTUNGEN) ergebnis[v] = 0;
  for (const p of positionen) {
    if (!(p.veranstaltung in ergebnis)) continue;
    if (p.ist_pfandrueckgabe) continue;
    ergebnis[p.veranstaltung] += p.menge * (preise[p.produkt_id] || 0);
  }
  for (const v of VERANSTALTUNGEN) ergebnis[v] = rund2(ergebnis[v]);
  return ergebnis;
}

// Runde 45: Wert der aktuell noch im Kiosk liegenden Ware (Bestand x
// tatsaechlichem Einkaufspreis pro Stueck) - Pendant zu
// repository.lagerwert_gesamt, rein informativ neben dem Gewinn.
export async function lagerwertGesamt() {
  const preise = await einkaufspreiseJeProdukt();
  const alle = await getAll("lagerbewegungen");
  const bestaende = {};
  for (const l of alle) {
    bestaende[l.produkt_id] = (bestaende[l.produkt_id] || 0) + l.menge;
  }
  let summe = 0;
  for (const [produktId, menge] of Object.entries(bestaende)) {
    summe += menge * (preise[produktId] || 0);
  }
  return rund2(summe);
}

async function positionenMitKasse(monatFilter = null) {
  const positionen = await getAll("positionen");
  const vorgaenge = await getAll("kassiervorgaenge");
  const vorgangJeId = Object.fromEntries(vorgaenge.map((v) => [v.id, v]));
  const produkte = await getAll("produkte");
  const produktJeId = Object.fromEntries(produkte.map((p) => [p.id, p]));
  return positionen
    .map((p) => {
      const vorgang = vorgangJeId[p.vorgang_id];
      if (!vorgang) return null;
      if (monatFilter && lokalerMonat(vorgang.datum) !== monatFilter) return null;
      return { ...p, veranstaltung: vorgang.veranstaltung, produkt: produktJeId[p.produkt_id] };
    })
    .filter(Boolean);
}

// Runde 44: k.gewinn ist hier bewusst nur ein ZWISCHENWERT (reiner
// Netto-Erloes = brutto - mwst je Position, OHNE Einkaufspreis-Abzug) -
// der tatsaechliche, anteilig nach Erloesanteil verteilte Wareneinkauf
// wird erst danach in auswertungJeKasse() bzw. monatsabrechnung()
// abgezogen (siehe dort). Vorher (bis Runde 43) wurde hier pro Position
// der am Produkt hinterlegte einkaufspreis abgezogen
// (berechneGewinnPosition) - das war nur eine grobe Schaetzung je Produkt,
// keine tatsaechlich gezahlte Nachbestellungs-Rechnung.
async function auswertungAusPositionen(positionen) {
  const ergebnis = {};
  for (const v of VERANSTALTUNGEN) {
    ergebnis[v] = { erloes: 0, mwst_7: 0, mwst_19: 0, gewinn: 0, pfand: 0 };
  }
  for (const p of positionen) {
    const k = ergebnis[p.veranstaltung];
    if (!k) continue;
    const brutto = p.menge * p.einzelpreis;
    const mwst = mwstBetrag(p.einzelpreis, p.mwst_satz) * p.menge;
    const gewinn = brutto - mwst;
    const pfand = p.menge * (p.pfand_betrag || 0);
    k.erloes = rund2(k.erloes + brutto);
    k.gewinn = rund2(k.gewinn + gewinn);
    k.pfand = rund2(k.pfand + pfand);
    if (Math.round(p.mwst_satz) === 7) {
      k.mwst_7 = rund2(k.mwst_7 + mwst);
    } else {
      k.mwst_19 = rund2(k.mwst_19 + mwst);
    }
  }
  return ergebnis;
}

// Ueber die GESAMTE Laufzeit (kein Zeitraumfilter), inkl. bereits als
// Gewinn verbuchtem Pfand (anders als in monatsabrechnung() - siehe dort).
// Runde 45: "Gewinn" je Kasse ist Netto-Erloes (aus
// auswertungAusPositionen) MINUS dem Wareneinsatz der tatsaechlich
// VERKAUFTEN Ware (wareneinsatzAusPositionen, mit den echten
// Einkaufspreisen aus den Wareneingaengen). Runde 44 hatte hier stattdessen
// den kompletten Lebenszeit-Wareneinkauf anteilig abgezogen - dadurch sah
// jeder Lageraufbau wie ein Verlust aus. Der bezahlte Wareneinkauf bleibt
// ueber wareneinkaufGesamt()/lagerwertGesamt() separat abrufbar.
export async function auswertungJeKasse() {
  const positionen = await positionenMitKasse();
  const ergebnis = await auswertungAusPositionen(positionen);

  const preise = await einkaufspreiseJeProdukt();
  const wareneinsatz = wareneinsatzAusPositionen(positionen, preise);
  for (const v of VERANSTALTUNGEN) {
    ergebnis[v].wareneinsatz = wareneinsatz[v];
    ergebnis[v].gewinn = rund2(ergebnis[v].gewinn - wareneinsatz[v]);
  }

  const verbucht = await pfandGewinnVerbuchtJeKasse();
  for (const v of VERANSTALTUNGEN) {
    const k = ergebnis[v];
    const betrag = verbucht[v] || 0;
    k.gewinn = rund2(k.gewinn + betrag);
    k.pfand = rund2(k.pfand - betrag);
  }
  return ergebnis;
}

// ---------------------------------------------------------------------
// Pfand-Gewinn-Verbuchung (Runde 40 am Rechner, Runde 43 auch auf dem
// Tablet) - Pendant zu repository.pfand_gewinn_verbuchen/-stornieren.
// Reine Umbuchung Kaution->Gewinn, kein Geldfluss.
// ---------------------------------------------------------------------

export async function pfandGewinnVerbuchen(veranstaltung, betrag, kommentar, benutzerName) {
  if (betrag == null || betrag <= 0) throw new Error("Betrag muss größer als 0 sein.");
  const auswertung = await auswertungJeKasse();
  const offenesPfand = auswertung[veranstaltung]?.pfand ?? 0;
  if (betrag > offenesPfand + 0.005) {
    throw new Error(
      `Betrag darf das aktuell offene Pfand (${offenesPfand.toFixed(2)} €) nicht übersteigen.`
    );
  }
  const id = neueId();
  const gid = await geraetId();
  await put("pfand_gewinn_verbuchungen", {
    id,
    datum: jetzt(),
    veranstaltung,
    betrag: rund2(betrag),
    kommentar: (kommentar || "").trim() || null,
    storno_von: null,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
  });
  return id;
}

export async function pfandGewinnVerbuchungIstStorniert(verbuchungId) {
  const alle = await getAll("pfand_gewinn_verbuchungen");
  return alle.some((v) => v.storno_von === verbuchungId);
}

export async function pfandGewinnStornieren(verbuchungId, benutzerName, kommentar = null) {
  const verbuchung = await get("pfand_gewinn_verbuchungen", verbuchungId);
  if (!verbuchung) throw new Error("Verbuchung nicht gefunden.");
  if (verbuchung.storno_von) {
    throw new Error("Eine Storno-Verbuchung kann nicht erneut storniert werden.");
  }
  if (await pfandGewinnVerbuchungIstStorniert(verbuchungId)) {
    throw new Error("Diese Verbuchung wurde bereits storniert.");
  }
  const id = neueId();
  const gid = await geraetId();
  await put("pfand_gewinn_verbuchungen", {
    id,
    datum: jetzt(),
    veranstaltung: verbuchung.veranstaltung,
    betrag: -verbuchung.betrag,
    kommentar: kommentar || `Storno zu Verbuchung ${verbuchungId}`,
    storno_von: verbuchungId,
    rechner: GERAET_NAME,
    geraet_id: gid,
    synced: false,
    synced_at: null,
    benutzer: benutzerName,
  });
  return id;
}

export async function letztePfandGewinnVerbuchungen(limit = 30) {
  const alle = await getAll("pfand_gewinn_verbuchungen");
  return alle.sort((a, b) => (a.datum < b.datum ? 1 : -1)).slice(0, limit);
}

export async function pfandGewinnVerbuchtJeKasse() {
  const alle = await getAll("pfand_gewinn_verbuchungen");
  const summe = {};
  for (const v of alle) {
    summe[v.veranstaltung] = rund2((summe[v.veranstaltung] || 0) + v.betrag);
  }
  return summe;
}

// ---------------------------------------------------------------------
// Weitere Auswertungs-Bausteine (Reiter "Auswertung" -> "Helfer &
// Zahlungen") - Pendant zu den jeweiligen repository.py-Funktionen.
// ---------------------------------------------------------------------

export async function helferkonsumJeKasse() {
  const positionen = await positionenMitKasse();
  const ergebnis = {};
  for (const v of VERANSTALTUNGEN) ergebnis[v] = { anzahl: 0, betrag: 0 };
  for (const p of positionen.filter((p) => p.ist_helferpreis)) {
    const k = ergebnis[p.veranstaltung];
    if (!k) continue;
    k.anzahl += p.menge;
    k.betrag = rund2(k.betrag + p.menge * p.einzelpreis);
  }
  return ergebnis;
}

export async function helferkonsumJeProdukt() {
  const positionen = await positionenMitKasse();
  const gruppen = {};
  for (const p of positionen.filter((p) => p.ist_helferpreis)) {
    const schluessel = `${p.veranstaltung}::${p.produkt_id}`;
    const eintrag = gruppen[schluessel] || {
      veranstaltung: p.veranstaltung,
      produkt_name: p.produkt?.name || "",
      anzahl: 0,
      betrag: 0,
    };
    eintrag.anzahl += p.menge;
    eintrag.betrag = rund2(eintrag.betrag + p.menge * p.einzelpreis);
    gruppen[schluessel] = eintrag;
  }
  return Object.values(gruppen).filter((g) => g.anzahl !== 0);
}

async function summeJeKasse(store, seit = null, betragsFeld = "betrag") {
  const alle = await getAll(store);
  const ergebnis = {};
  for (const v of VERANSTALTUNGEN) ergebnis[v] = 0;
  for (const zeile of alle) {
    if (seit && zeile.datum <= seit) continue;
    if (!(zeile.veranstaltung in ergebnis)) continue;
    ergebnis[zeile.veranstaltung] = rund2(ergebnis[zeile.veranstaltung] + zeile[betragsFeld]);
  }
  return ergebnis;
}

export async function schiedsrichterAuszahlungenJeKasse() {
  return summeJeKasse("schiedsrichter_auszahlungen");
}

export async function bargeldEinzahlungenJeKasse() {
  return summeJeKasse("bargeld_einzahlungen");
}

export async function sonstigeAusgabenJeKasse() {
  return summeJeKasse("sonstige_ausgaben");
}

export async function bargeldEntnahmenJeKasse() {
  return summeJeKasse("bargeld_entnahmen");
}

export async function lieferantenPfandGesamt() {
  const alle = await getAll("lieferanten_pfand");
  const bezahlt = rund2(alle.reduce((s, e) => s + e.bezahlt, 0));
  const erhalten = rund2(alle.reduce((s, e) => s + e.erhalten, 0));
  return { bezahlt, erhalten, saldo: rund2(bezahlt - erhalten) };
}

export async function lieferantenPfandMonat(jahr, monat) {
  const monatStr = `${String(jahr).padStart(4, "0")}-${String(monat).padStart(2, "0")}`;
  const alle = await getAll("lieferanten_pfand");
  const zeilen = alle.filter((e) => lokalerMonat(e.datum) === monatStr);
  const bezahlt = rund2(zeilen.reduce((s, e) => s + e.bezahlt, 0));
  const erhalten = rund2(zeilen.reduce((s, e) => s + e.erhalten, 0));
  return { bezahlt, erhalten, saldo: rund2(bezahlt - erhalten) };
}

export async function verkaeufeJeProdukt(jahr, monat) {
  const monatStr = `${String(jahr).padStart(4, "0")}-${String(monat).padStart(2, "0")}`;
  const alle = await getAll("positionen");
  const vorgaenge = await getAll("kassiervorgaenge");
  const vorgangJeId = Object.fromEntries(vorgaenge.map((v) => [v.id, v]));
  const produkte = await getAll("produkte");
  const produktJeId = Object.fromEntries(produkte.map((p) => [p.id, p]));
  const gruppen = {};
  for (const p of alle) {
    if (p.ist_pfandrueckgabe) continue;
    const vorgang = vorgangJeId[p.vorgang_id];
    if (!vorgang || lokalerMonat(vorgang.datum) !== monatStr) continue;
    const produkt = produktJeId[p.produkt_id];
    const schluessel = `${vorgang.veranstaltung}::${p.produkt_id}`;
    const eintrag = gruppen[schluessel] || {
      veranstaltung: vorgang.veranstaltung,
      produkt_name: produkt ? produkt.name : "",
      anzahl: 0,
      betrag: 0,
    };
    eintrag.anzahl += p.menge;
    eintrag.betrag = rund2(eintrag.betrag + p.menge * p.einzelpreis);
    gruppen[schluessel] = eintrag;
  }
  return Object.values(gruppen).filter((g) => g.anzahl !== 0);
}

export async function wareneinkaufBericht(jahr, monat) {
  const monatStr = `${String(jahr).padStart(4, "0")}-${String(monat).padStart(2, "0")}`;
  const alle = await getAll("lagerbewegungen");
  const produkte = await getAll("produkte");
  const produktJeId = Object.fromEntries(produkte.map((p) => [p.id, p]));
  const gruppen = {};
  for (const l of alle) {
    if (l.typ !== "Wareneingang" || lokalerMonat(l.datum) !== monatStr) continue;
    const produkt = produktJeId[l.produkt_id];
    if (!produkt) continue;
    const eintrag = gruppen[l.produkt_id] || {
      produkt_id: l.produkt_id,
      name: produkt.name,
      menge: 0,
      netto: 0,
      mwst: 0,
      geschaetzt: false,
    };
    eintrag.menge += l.menge;
    // Ein erfasster Preis von 0,00 EUR ist kein realistischer
    // Einkaufspreis - wird deshalb wie nicht erfasst behandelt (Runde 46).
    const geschaetzt = l.einzelpreis == null || l.einzelpreis <= 0;
    const einzelpreis = geschaetzt ? produkt.einkaufspreis || 0 : l.einzelpreis;
    const satz = geschaetzt ? produkt.mwst_satz || 0 : l.mwst_satz || 0;
    eintrag.netto = rund2(eintrag.netto + einzelpreis * l.menge);
    eintrag.mwst = rund2(eintrag.mwst + (einzelpreis * l.menge * satz) / 100);
    eintrag.geschaetzt = eintrag.geschaetzt || geschaetzt;
    gruppen[l.produkt_id] = eintrag;
  }
  return Object.values(gruppen)
    .map((e) => ({ ...e, brutto: rund2(e.netto + e.mwst) }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

// Runde 44: GESAMTE (Lebenszeit, kein Zeitraumfilter) Netto-
// Wareneinkaufssumme ueber ALLE Wareneingaenge - Grundlage fuer den
// anteiligen Wareneinkaufsabzug in auswertungJeKasse(). Gleiches
// Fallback-Prinzip wie wareneinkaufBericht(): fehlt einzelpreis/mwst_satz
// an der Lagerbewegung (z.B. eine Alt-Buchung ohne erfassten Preis), wird
// ersatzweise der am Produkt hinterlegte einkaufspreis verwendet. Anders
// als wareneinkaufBericht() nur die reine Netto-Summe, keine Gruppierung
// nach Produkt.
export async function wareneinkaufGesamt() {
  const alle = await getAll("lagerbewegungen");
  const produkte = await getAll("produkte");
  const produktJeId = Object.fromEntries(produkte.map((p) => [p.id, p]));
  let netto = 0;
  for (const l of alle) {
    if (l.typ !== "Wareneingang") continue;
    const produkt = produktJeId[l.produkt_id];
    if (!produkt) continue;
    // Ein erfasster Preis von 0,00 EUR ist kein realistischer
    // Einkaufspreis - wird deshalb wie nicht erfasst behandelt (Runde 46).
    const geschaetzt = l.einzelpreis == null || l.einzelpreis <= 0;
    const einzelpreis = geschaetzt ? produkt.einkaufspreis || 0 : l.einzelpreis;
    netto = rund2(netto + einzelpreis * l.menge);
  }
  return rund2(netto);
}

// Vollstaendige Monatsabrechnung - Pendant zu repository.monatsabrechnung.
// WICHTIG: je_kasse rechnet hier - anders als auswertungJeKasse() - die
// Pfand-Gewinn-Verbuchung NICHT ein (reine Monatszahlen aus den
// Positionen), exakt wie am Rechner. Runde 44: "Gewinn" je Kasse ist ab
// hier Netto-Erloes (aus auswertungAusPositionen) MINUS dem tatsaechlichen
// Wareneinkauf DIESES MONATS (aus wareneinkaufBericht(), echte
// Nachbestellungs-/Wareneingangspreise), anteilig nach Erloesanteil
// verteilt (siehe wareneinkaufAnteile()) - nicht mehr der pro Position
// geschaetzte Einkaufspreis.
export async function monatsabrechnung(jahr, monat) {
  const monatStr = `${String(jahr).padStart(4, "0")}-${String(monat).padStart(2, "0")}`;
  const positionenAlle = await positionenMitKasse(monatStr);
  const jeKasse = await auswertungAusPositionen(positionenAlle);

  const kassenstuerzeAlle = await getAll("kassenstuerze");
  const kassensturzHistorie = kassenstuerzeAlle
    .filter((k) => lokalerMonat(k.datum) === monatStr)
    .sort((a, b) => (a.datum < b.datum ? -1 : 1));

  const entnahmeJeKasse = {};
  for (const v of VERANSTALTUNGEN) entnahmeJeKasse[v] = 0;
  for (const k of kassensturzHistorie) {
    if (!(k.veranstaltung in entnahmeJeKasse)) continue;
    entnahmeJeKasse[k.veranstaltung] = rund2(
      entnahmeJeKasse[k.veranstaltung] + (k.gezaehlter_betrag - k.naechster_startbetrag)
    );
  }

  const einzahlungenAlle = await getAll("bargeld_einzahlungen");
  const ausgabenAlle = await getAll("sonstige_ausgaben");
  const entnahmenAlle = await getAll("bargeld_entnahmen");
  const schiedsrichterAlle = await getAll("schiedsrichter_auszahlungen");

  const einzahlungJeKasse = await summeMonat(einzahlungenAlle, monatStr);
  const sonstigeAusgabenJeKasseM = await summeMonat(ausgabenAlle, monatStr);
  const schiedsrichterJeKasse = await summeMonat(schiedsrichterAlle, monatStr);
  const bargeldEntnahmenGebucht = entnahmenAlle
    .filter((e) => lokalerMonat(e.datum) === monatStr)
    .sort((a, b) => (a.datum < b.datum ? -1 : 1));

  const verkaeufe = await verkaeufeJeProdukt(jahr, monat);
  const gesamtMengeVerkauft = verkaeufe.reduce((s, v) => s + v.anzahl, 0);
  const wareneinkauf = await wareneinkaufBericht(jahr, monat);
  const gesamtMengeEingekauft = wareneinkauf.reduce((s, w) => s + w.menge, 0);
  const wareneinkaufGeschaetzt = wareneinkauf.some((w) => w.geschaetzt);
  const gesamtWareneinkaufNetto = rund2(wareneinkauf.reduce((s, w) => s + w.netto, 0));
  const gesamtVorsteuer = rund2(wareneinkauf.reduce((s, w) => s + w.mwst, 0));
  const gesamtWareneinkaufBrutto = rund2(gesamtWareneinkaufNetto + gesamtVorsteuer);

  // Runde 45: Wareneinsatz der in DIESEM MONAT verkauften Ware abziehen
  // (analog zu auswertungJeKasse), nicht mehr der komplette Wareneinkauf
  // des Monats (Runde 44) - sonst waere jeder Monat mit einer groesseren
  // Lieferung faelschlich ein Verlustmonat.
  const preiseMonat = await einkaufspreiseJeProdukt();
  const wareneinsatzMonat = wareneinsatzAusPositionen(positionenAlle, preiseMonat);
  for (const v of VERANSTALTUNGEN) {
    jeKasse[v].wareneinsatz = wareneinsatzMonat[v];
    jeKasse[v].gewinn = rund2(jeKasse[v].gewinn - wareneinsatzMonat[v]);
  }
  const gesamtWareneinsatz = rund2(
    VERANSTALTUNGEN.reduce((s, v) => s + wareneinsatzMonat[v], 0)
  );

  const gesamtErloes = rund2(VERANSTALTUNGEN.reduce((s, v) => s + jeKasse[v].erloes, 0));
  const gesamtGewinn = rund2(VERANSTALTUNGEN.reduce((s, v) => s + jeKasse[v].gewinn, 0));
  const gesamtPfand = rund2(VERANSTALTUNGEN.reduce((s, v) => s + jeKasse[v].pfand, 0));
  const gesamtUmsatzsteuer = rund2(
    VERANSTALTUNGEN.reduce((s, v) => s + jeKasse[v].mwst_7 + jeKasse[v].mwst_19, 0)
  );
  const gesamtSchiedsrichter = rund2(VERANSTALTUNGEN.reduce((s, v) => s + (schiedsrichterJeKasse[v] || 0), 0));
  const gesamtSonstigeAusgaben = rund2(
    VERANSTALTUNGEN.reduce((s, v) => s + (sonstigeAusgabenJeKasseM[v] || 0), 0)
  );
  const lieferantenPfand = await lieferantenPfandMonat(jahr, monat);
  const abschreibungen = await abschreibungenBericht(jahr, monat);
  const gesamtAbschreibungenWert = rund2(abschreibungen.reduce((s, a) => s + a.wert, 0));

  return {
    jahr,
    monat,
    je_kasse: jeKasse,
    schiedsrichter_je_kasse: schiedsrichterJeKasse,
    kassensturz_historie: kassensturzHistorie,
    entnahme_je_kasse: entnahmeJeKasse,
    einzahlung_je_kasse: einzahlungJeKasse,
    sonstige_ausgaben_je_kasse: sonstigeAusgabenJeKasseM,
    bargeld_entnahmen_gebucht: bargeldEntnahmenGebucht,
    verkaeufe_je_produkt: verkaeufe,
    gesamt_menge_verkauft: gesamtMengeVerkauft,
    wareneinkauf,
    gesamt_menge_eingekauft: gesamtMengeEingekauft,
    wareneinkauf_teilweise_geschaetzt: wareneinkaufGeschaetzt,
    gesamt_wareneinkauf_netto: gesamtWareneinkaufNetto,
    // Runde 45: Wareneinsatz der verkauften Ware (Grundlage des Gewinns),
    // bewusst getrennt vom bezahlten Wareneinkauf oben.
    gesamt_wareneinsatz: gesamtWareneinsatz,
    gesamt_vorsteuer: gesamtVorsteuer,
    gesamt_wareneinkauf_brutto: gesamtWareneinkaufBrutto,
    gesamt_erloes: gesamtErloes,
    gesamt_gewinn: gesamtGewinn,
    gesamt_pfand: gesamtPfand,
    lieferanten_pfand: lieferantenPfand,
    gesamt_schiedsrichter: gesamtSchiedsrichter,
    gesamt_ergebnis_nach_schiedsrichter: rund2(gesamtGewinn - gesamtSchiedsrichter),
    gesamt_sonstige_ausgaben: gesamtSonstigeAusgaben,
    gesamt_ergebnis_nach_ausgaben: rund2(gesamtGewinn - gesamtSchiedsrichter - gesamtSonstigeAusgaben),
    gesamt_umsatzsteuer: gesamtUmsatzsteuer,
    mwst_zahllast: rund2(gesamtUmsatzsteuer - gesamtVorsteuer),
    abschreibungen,
    gesamt_abschreibungen_wert: gesamtAbschreibungenWert,
  };
}

async function summeMonat(zeilen, monatStr) {
  const ergebnis = {};
  for (const v of VERANSTALTUNGEN) ergebnis[v] = 0;
  for (const z of zeilen) {
    if (lokalerMonat(z.datum) !== monatStr) continue;
    if (!(z.veranstaltung in ergebnis)) continue;
    ergebnis[z.veranstaltung] = rund2(ergebnis[z.veranstaltung] + z.betrag);
  }
  return ergebnis;
}
