// Anmeldungs-Sitzung (aktueller Benutzer + aktive Kasse) - rein im
// Arbeitsspeicher, bewusst OHNE automatische Abmeldung nach Inaktivitaet
// (siehe Rueckfrage zur Benutzerverwaltung in der Windows-App) und ohne
// Persistierung ueber einen Neuladen der Seite hinaus - ein Neuladen
// erfordert eine erneute Anmeldung, genau wie ein Neustart der Windows-App.

const zustand = {
  benutzer: null,
  kasse: "Jugend",
};

export function anmelden(benutzer) {
  zustand.benutzer = benutzer;
}

export function abmelden() {
  zustand.benutzer = null;
}

export function getAktuellerBenutzer() {
  return zustand.benutzer;
}

export function istAngemeldet() {
  return zustand.benutzer !== null;
}

export function setAktiveKasse(kasse) {
  zustand.kasse = kasse;
}

export function getAktiveKasse() {
  return zustand.kasse;
}
