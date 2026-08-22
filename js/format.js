// Zahlenformatierung im deutschen Format - Pendant zu kiosk/format.py.

export function deZahl(value, vorzeichen = false) {
  const zahl = Math.round((value + Number.EPSILON) * 100) / 100;
  const formatiert = zahl.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (vorzeichen && zahl >= 0) {
    return "+" + formatiert;
  }
  return formatiert;
}

export function euro(value, vorzeichen = false) {
  return `${deZahl(value, vorzeichen)} €`;
}

export function rund2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Im Bruttopreis enthaltener MwSt.-Betrag bzw. daraus abgeleiteter
// Netto-Preis - Pendant zu kiosk/mwst.py (mwst_betrag/netto_preis). Wird
// beim Erfassen einer Nachbestellung mit Preis pro Stück gebraucht (siehe
// main.js), damit lokal derselbe Netto-Preis wie am Rechner gespeichert
// wird.
export function mwstBetrag(bruttoPreis, mwstSatz) {
  return rund2((bruttoPreis * mwstSatz) / (100 + mwstSatz));
}

export function nettoPreis(bruttoPreis, mwstSatz) {
  return rund2(bruttoPreis - mwstBetrag(bruttoPreis, mwstSatz));
}
