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
