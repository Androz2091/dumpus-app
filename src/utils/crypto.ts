/**
 * A package's blob in S3 is `AES-CBC(SHA-256(UPN), iv, PKCS7(gzippedSqlite))`:
 * the worker writes it for a package read from a link, and the app for one it
 * read from its file, with a key of its own in place of the UPN. The API keeps
 * no key: it gets one as a bearer, and keeps its MD5 as the package's id.
 *
 * SubtleCrypto's AES-CBC handles PKCS7 padding for us.
 */

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0) {
    throw new Error(`invalid iv hex length: ${hex.length}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function blobKey(upnKey: string, usage: "encrypt" | "decrypt") {
  const upnBytes = new TextEncoder().encode(upnKey);
  const keyDigest = await crypto.subtle.digest("SHA-256", upnBytes);
  return crypto.subtle.importKey("raw", keyDigest, { name: "AES-CBC" }, false, [
    usage,
  ]);
}

/** Returns the gzipped SQLite bytes; caller still needs to inflate. */
export async function decryptPackageBlob(
  encrypted: ArrayBuffer,
  ivHex: string,
  upnKey: string,
): Promise<ArrayBuffer> {
  const iv = hexToBytes(ivHex);
  if (iv.length !== 16) {
    throw new Error(`expected 16-byte iv, got ${iv.length}`);
  }

  const key = await blobKey(upnKey, "decrypt");
  return crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, encrypted);
}

/** The blob of gzipped SQLite bytes, and its random iv in hex. */
export async function encryptPackageBlob(
  gzipped: Uint8Array<ArrayBuffer>,
  upnKey: string,
): Promise<{ encrypted: ArrayBuffer; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await blobKey(upnKey, "encrypt");
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    gzipped,
  );
  return { encrypted, iv: bytesToHex(iv) };
}
