/**
 * POST /api/progress
 *
 * Issues a signed receipt for typing progress.
 * The client calls this every N characters to prove
 * typing is happening in real-time on the server clock.
 *
 * Env vars:
 *   CTF_SECRET = HMAC signing key
 */

const crypto = require('crypto');

const SECRET = process.env.CTF_SECRET || 'change-this-in-vercel-env-vars';

function verify(tokenStr) {
  const parts = tokenStr.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    return payload;
  } catch { return null; }
}

function signReceipt(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { token, pos } = req.body || {};
  if (!token || typeof pos !== 'number') {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const payload = verify(token);
  if (!payload) return res.status(403).json({ error: 'Invalid session' });

  // Create signed receipt with SERVER timestamp — client can't forge this
  const receipt = signReceipt({
    n: payload.n,                        // ties receipt to this session
    p: pos,                              // character position
    t: Math.floor(Date.now() / 1000)     // server Unix time
  });

  res.status(200).json({ receipt });
};
