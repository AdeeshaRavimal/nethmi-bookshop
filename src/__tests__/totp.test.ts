import { describe, it, expect } from 'vitest';
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateOtpAuthUri,
  generateTotpCode,
  verifyTotpCode,
} from '../utils/totp';

describe('RFC 6238 TOTP Engine', () => {
  it('encodes and decodes base32 correctly', () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const encoded = base32Encode(original);
    expect(encoded).toBe('JBSWY3DP');

    const decoded = base32Decode(encoded);
    expect(decoded).toEqual(original);
  });

  it('generates random 32-character base32 secret', () => {
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(32);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it('generates valid otpauth URL for Google Authenticator QR Code', () => {
    const uri = generateOtpAuthUri('JBSWY3DPEHPK3PXP', 'StoreManager', 'Hiru Bookshop');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=Hiru%20Bookshop');
  });

  it('generates and verifies 6-digit TOTP code within time window', async () => {
    const secret = generateTotpSecret();
    const now = Date.now();

    const code = await generateTotpCode(secret, now);
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);

    // Verify current code
    const isValidNow = await verifyTotpCode(secret, code, now);
    expect(isValidNow).toBe(true);

    // Verify within +20s drift window
    const isValidDrift = await verifyTotpCode(secret, code, now + 20000);
    expect(isValidDrift).toBe(true);

    // Reject wrong code
    const isInvalid = await verifyTotpCode(secret, '000000', now);
    expect(isInvalid).toBe(false);

    // Reject expired code outside drift window (e.g. 2 minutes later)
    const isExpired = await verifyTotpCode(secret, code, now + 120000);
    expect(isExpired).toBe(false);
  });
});
