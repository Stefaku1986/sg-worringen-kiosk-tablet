// PIN-Hashing - Pendant zu kiosk/auth.py, bewusst byte-identisch
// (PBKDF2-HMAC-SHA256, 200.000 Iterationen, 256 Bit Ausgabe, Hex-codiert),
// damit ein am Rechner vergebener PIN auch hier korrekt geprueft werden
// kann und umgekehrt. Cross-Kompatibilitaet wurde vor dem Bau dieser App
// explizit gegen die Python-Implementierung verifiziert.

const ITERATIONEN = 200_000;

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function zufallsSaltHex(laengeBytes = 16) {
  const bytes = new Uint8Array(laengeBytes);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function pinHashen(pin, saltHex = null) {
  const salt = saltHex ?? zufallsSaltHex();
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(salt), iterations: ITERATIONEN, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt };
}

function zeitkonstanterVergleich(a, b) {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) {
    unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return unterschied === 0;
}

export async function pinPruefen(pin, pinHash, pinSalt) {
  if (!pin || !pinHash || !pinSalt) return false;
  const { hash } = await pinHashen(pin, pinSalt);
  return zeitkonstanterVergleich(hash, pinHash);
}
