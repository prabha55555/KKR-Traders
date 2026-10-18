#!/usr/bin/env node
/**
 * Makes the stored form of a new ADMINISTRATOR password for src/core/admin.js (Brightlight Solutions' Settings login).
 * The password itself is never stored — only this salted PBKDF2-SHA-256 hash.
 *
 *   node scripts/admin-hash.mjs "<new password>"
 *
 * Paste the printed salt / iterations / passwordHash into ADMIN_ACCOUNT in src/core/admin.js, then rebuild.
 */
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 6) {
  console.error('Usage: node scripts/admin-hash.mjs "<new password (at least 6 characters)>"');
  process.exit(1);
}
const iterations = 600000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
console.log(`  salt: '${salt.toString('base64')}',`);
console.log(`  iterations: ${iterations},`);
console.log(`  passwordHash: '${hash.toString('base64')}',`);
