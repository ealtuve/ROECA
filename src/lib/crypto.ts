/**
 * Client-side Web Crypto utilities for salted PBKDF2-SHA256 operator passwords
 * and SHA-256 integrity checksums for database backups.
 */

const ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

export function generateSalt(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function hashPassword(
  password: string,
  existingSalt?: string
): Promise<{ hash: string; salt: string }> {
  const salt = existingSalt || generateSalt(16);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const saltBytes = hexToBytes(salt);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH_BITS
  );

  return {
    hash: bytesToHex(new Uint8Array(derivedBits)),
    salt,
  };
}

export async function verifyPassword(
  password: string,
  salt: string | null | undefined,
  expectedHash: string | null | undefined
): Promise<boolean> {
  if (!password || !salt || !expectedHash) return false;
  try {
    const { hash } = await hashPassword(password, salt);
    if (hash.length !== expectedHash.length) return false;
    // Constant-time comparison
    let diff = 0;
    for (let i = 0; i < hash.length; i++) {
      diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

export async function computeSha256(content: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(content));
  return bytesToHex(new Uint8Array(buf));
}
