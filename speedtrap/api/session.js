/**
 * GET /api/session
 *
 * Issues a signed session token + a random paragraph to type.
 * The paragraph ID is embedded in the token so the client can't swap it.
 *
 * Env vars:
 *   CTF_SECRET = HMAC signing key
 */

const crypto = require('crypto');

const SECRET = process.env.CTF_SECRET || 'change-this-in-vercel-env-vars';
const TTL_SECONDS = 300; // 5 minutes — generous for ~40s of typing + retries

const PARAGRAPHS = [
  "The hacker slipped past the firewall like a ghost leaving nothing but an encrypted message hidden deep in the server logs.",
  "Every strong password tells a story of randomness and chaos. The weak ones are just birthdays stuck on sticky notes nearby.",
  "A zero day exploit is like finding a secret unlocked door that nobody else knows about. Pure power in the hands of a finder.",
  "The encrypted file sat on the server untouched for six long months until one curious intern finally decided to crack it open.",
  "Social engineering is the art of hacking humans instead of machines. Trust and curiosity are always the biggest vulnerabilities."
];

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

module.exports = (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  const idx   = Math.floor(Math.random() * PARAGRAPHS.length);
  const now   = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');

  const token = sign({
    n:   nonce,
    p:   idx,
    iat: now,
    exp: now + TTL_SECONDS
  });

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ token, text: PARAGRAPHS[idx] });
};
