/**
 * RFC 6238 TOTP (Time-based One-Time Password) implementation.
 * Compatible with Google Authenticator, Microsoft Authenticator, and standard TOTP apps.
 */

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a Uint8Array into a Base32 string.
 */
export function base32Encode(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes a Base32 string into a Uint8Array.
 */
export function base32Decode(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_CHARS.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${cleaned[i]}`);
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Generates a cryptographically random Base32 TOTP secret (20 bytes = 32 Base32 characters).
 */
export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  const cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : globalThis.crypto;
  cryptoObj.getRandomValues(bytes);
  return base32Encode(bytes);
}

/**
 * Generates the standard otpauth URI used by Google Authenticator QR codes.
 */
export function generateOtpAuthUri(secret: string, accountName: string = 'Manager', issuer: string = 'Hiru Bookshop'): string {
  const cleanSecret = secret.replace(/[\s-]/g, '').toUpperCase();
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${cleanSecret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generates a 6-digit TOTP code for a specific timestamp (default: now).
 */
export async function generateTotpCode(secret: string, timestampMs: number = Date.now()): Promise<string> {
  const keyBytes = base32Decode(secret);
  const timeStep = Math.floor(timestampMs / 1000 / 30);

  // Pack counter as 8-byte big-endian buffer
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  // Upper 32 bits
  view.setUint32(0, Math.floor(timeStep / 0x100000000));
  // Lower 32 bits
  view.setUint32(4, timeStep & 0xffffffff);

  const subtle = (typeof window !== 'undefined' && window.crypto?.subtle) 
    ? window.crypto.subtle 
    : (globalThis.crypto?.subtle);

  if (!subtle) {
    throw new Error('WebCrypto subtle is not available in current environment');
  }

  const cryptoKey = await subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hmacResult = new Uint8Array(signature);

  // Dynamic truncation (RFC 4226)
  const offset = hmacResult[hmacResult.length - 1] & 0x0f;
  const binary =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  const otp = (binary % 1000000).toString().padStart(6, '0');
  return otp;
}

/**
 * Verifies a 6-digit TOTP code with a ±1 time step window (current, previous 30s, next 30s).
 */
export async function verifyTotpCode(secret: string, inputCode: string, timestampMs: number = Date.now()): Promise<boolean> {
  const cleanCode = inputCode.trim();
  if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
    return false;
  }

  // Check windows: -1 step, 0 step, +1 step (prevents rejection from slight clock drift)
  const steps = [-1, 0, 1];
  for (const step of steps) {
    const stepTime = timestampMs + step * 30 * 1000;
    try {
      const expectedCode = await generateTotpCode(secret, stepTime);
      if (expectedCode === cleanCode) {
        return true;
      }
    } catch {
      // Continue checking other steps
    }
  }

  return false;
}
