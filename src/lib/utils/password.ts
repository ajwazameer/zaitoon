/**
 * Secure password hashing using Node.js native crypto (scrypt)
 * No external dependencies — works in Next.js API routes (server-side only).
 *
 * Stored format: "scrypt:N:r:p:salt:hash"
 * OWASP-recommended parameters for 2024.
 */

import { scrypt, randomBytes, timingSafeEqual } from 'crypto'

const KEYLEN = 64
const PARAMS = { N: 16384, r: 8, p: 1 }

/** Wrap Node callback-style scrypt in a Promise */
function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err)
      else resolve(derivedKey)
    })
  })
}

/**
 * Hash a plain-text password.
 * Returns a self-contained string encoding salt + parameters — safe to store in DB.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(32).toString('hex')
  const hash = (await scryptAsync(plain, salt, KEYLEN, PARAMS)).toString('hex')
  return `scrypt:${PARAMS.N}:${PARAMS.r}:${PARAMS.p}:${salt}:${hash}`
}

/**
 * Compare a plain-text password against a stored scrypt hash.
 * Uses timing-safe comparison to prevent timing attacks.
 * Returns false (never throws) if hash format is unrecognised.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    if (!stored.startsWith('scrypt:')) return false
    const parts = stored.split(':')
    if (parts.length !== 6) return false
    const [, N, r, p, salt, expectedHex] = parts
    const expected = Buffer.from(expectedHex, 'hex')
    const actual = await scryptAsync(plain, salt, expected.length, {
      N: parseInt(N, 10),
      r: parseInt(r, 10),
      p: parseInt(p, 10),
    })
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/**
 * Returns true if the stored value is plain-text (not yet hashed).
 * Used for the lazy-migration check during login.
 */
export function isPlainText(stored: string): boolean {
  return !stored.startsWith('scrypt:')
}
