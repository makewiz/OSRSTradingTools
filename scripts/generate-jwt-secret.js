/**
 * Generate a secure JWT secret for production use
 * Run this script with: node scripts/generate-jwt-secret.js
 */

const crypto = require('crypto');

const secret = crypto.randomBytes(32).toString('hex');

console.log('='.repeat(60));
console.log('🔐 JWT Secret Generated');
console.log('='.repeat(60));
console.log('');
console.log('Your secure JWT secret:');
console.log('');
console.log(secret);
console.log('');
console.log('⚠️  Keep this secret safe!');
console.log('- Do NOT commit this to version control');
console.log('- Use it in your Railway environment variables');
console.log('- Generate a new one for each environment');
console.log('');
console.log('To use in Railway:');
console.log('1. Go to your Backend service');
console.log('2. Click "Variables" tab');
console.log('3. Add JWT_SECRET=' + secret);
console.log('='.repeat(60));
