/**
 * POST /api/check
 *
 * Validates typing speed, accuracy, and anti-bot checks.
 * Returns the flag ONLY when ALL of these pass:
 *   1. Token is valid + not expired + not reused
 *   2. Typed text matches the assigned paragraph
 *   3. Server-side elapsed time is realistic
 *   4. Client WPM is within target range
 *   5. Signed progress receipts prove real-time typing
 *   6. Keystroke timing looks human (variance + speed)
 *
 * Env vars (ALL required in production):
 *   CTF_SECRET     = HMAC signing key
 *   CTF_FLAG       = the flag value
 *   CTF_TARGET_WPM = target WPM (default 35)
 *   CTF_TOLERANCE  = +/- range (default 2)
 */

const crypto = require('crypto');

const SECRET     = process.env.CTF_SECRET     || 'change-this-in-vercel-env-vars';
const FLAG       = process.env.CTF_FLAG;   // no fallback — MUST be set in env
const TARGET_WPM = parseInt(process.env.CTF_TARGET_WPM || '35', 10);
const TOLERANCE  = parseInt(process.env.CTF_TOLERANCE  || '2',  10);

const MIN_RECEIPTS   = 5;   // minimum signed progress checkpoints
const PROGRESS_EVERY = 15;  // client sends receipt every N chars

const PARAGRAPHS = [
  "The hacker slipped past the firewall like a ghost leaving nothing but an encrypted message hidden deep in the server logs.",
  "Every strong password tells a story of randomness and chaos. The weak ones are just birthdays stuck on sticky notes nearby.",
  "A zero day exploit is like finding a secret unlocked door that nobody else knows about. Pure power in the hands of a finder.",
  "The encrypted file sat on the server untouched for six long months until one curious intern finally decided to crack it open.",
  "Social engineering is the art of hacking humans instead of machines. Trust and curiosity are always the biggest vulnerabilities."
];

// Anti-replay: in-memory set (resets on cold start)
const usedTokens = new Set();
setInterval(() => usedTokens.clear(), 5 * 60 * 1000);

/* ── Crypto helpers ── */

function verify(tokenStr) {
  const parts = tokenStr.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

function verifyReceipt(receiptStr) {
  if (typeof receiptStr !== 'string') return null;
  const parts = receiptStr.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  try { return JSON.parse(Buffer.from(data, 'base64url').toString()); }
  catch { return null; }
}

function fail(res, nonce, reason, message) {
  if (nonce) usedTokens.add(nonce);
  return res.status(200).json({ success: false, reason, message });
}

/* ── Handler ── */

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Fail-safe: refuse to run without a flag set
  if (!FLAG) {
    return res.status(500).json({ error: 'Challenge misconfigured — CTF_FLAG env var not set. Contact admin.' });
  }

  const { token, keystrokes, startTime, endTime, receipts, typedText } = req.body || {};

  if (!token || !keystrokes || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  // ── 1. Verify token ──
  const payload = verify(token);
  if (!payload) return res.status(403).json({ error: 'Invalid or expired session' });

  // ── 2. Anti-replay ──
  if (usedTokens.has(payload.n)) {
    return res.status(403).json({ error: 'Session already used. Refresh and try again.' });
  }

  // ── 3. Get assigned paragraph ──
  const paraIdx = payload.p;
  if (paraIdx < 0 || paraIdx >= PARAGRAPHS.length) {
    return res.status(400).json({ error: 'Invalid paragraph index' });
  }
  const expectedText = PARAGRAPHS[paraIdx];
  const charCount    = expectedText.length;
  const minWPM       = TARGET_WPM - TOLERANCE;
  const maxWPM       = TARGET_WPM + TOLERANCE;

  // ── 4. Verify typed text matches paragraph ──
  if (!typedText || typeof typedText !== 'string') {
    return fail(res, payload.n, 'missing_text',
      'No typed text received. Use the real interface.');
  }
  if (typedText !== expectedText) {
    return fail(res, payload.n, 'text_mismatch',
      'Typed text does not match the assigned paragraph.');
  }

  // ── 5. Keystroke count ──
  if (keystrokes.length < charCount * 0.85) {
    return fail(res, payload.n, 'incomplete',
      'Not enough keystrokes recorded. Did you paste?');
  }

  // ── 6. Server-side elapsed-time check ──
  const serverNow = Math.floor(Date.now() / 1000);
  const tokenAgeSec = serverNow - payload.iat;

  // Minimum real time to type this at max allowed WPM
  const minRealTimeSec = (charCount / 5) / maxWPM * 60;

  if (tokenAgeSec < minRealTimeSec - 3) {
    return fail(res, payload.n, 'too_quick',
      'Not enough real time has passed since session start. Nice try.');
  }

  // Client can't claim more time than actually passed
  const clientElapsedSec = (endTime - startTime) / 1000;
  if (clientElapsedSec > tokenAgeSec + 5) {
    return fail(res, payload.n, 'time_travel',
      'Client timing exceeds real elapsed time. Clock manipulation detected.');
  }

  // ── 7. Client-side WPM ──
  const elapsedMin = (endTime - startTime) / 60000;
  const wpm        = (charCount / 5) / elapsedMin;
  const wpmRound   = Math.round(wpm * 10) / 10;

  if (wpm < minWPM) {
    return fail(res, payload.n, 'too_slow',
      `Too slow! ${wpmRound} WPM. The vault needs exactly ${TARGET_WPM}.`);
  }
  if (wpm > maxWPM) {
    return fail(res, payload.n, 'too_fast',
      `Too fast! ${wpmRound} WPM triggers the alarm. Slow down to ${TARGET_WPM}.`);
  }

  // ── 8. Progress receipts (server-signed timestamps) ──
  if (!Array.isArray(receipts) || receipts.length < MIN_RECEIPTS) {
    return fail(res, payload.n, 'no_progress',
      'Not enough progress checkpoints. Use the real typing interface.');
  }

  const verified = [];
  for (const r of receipts) {
    const rp = verifyReceipt(r);
    if (rp && rp.n === payload.n && typeof rp.p === 'number' && typeof rp.t === 'number') {
      verified.push(rp);
    }
  }

  if (verified.length < MIN_RECEIPTS) {
    return fail(res, payload.n, 'bad_receipts',
      'Progress checkpoints failed verification. Tampering detected.');
  }

  // Server-side WPM from receipt timestamps
  verified.sort((a, b) => a.p - b.p);
  const firstR = verified[0];
  const lastR  = verified[verified.length - 1];
  const receiptSpanSec  = lastR.t - firstR.t;
  const receiptCharSpan = lastR.p - firstR.p;

  if (receiptCharSpan > 0 && receiptSpanSec > 0) {
    const serverWPM = (receiptCharSpan / 5) / (receiptSpanSec / 60);
    // Wider band (±10) because receipts are sampled every 15 chars
    if (serverWPM < TARGET_WPM - 10 || serverWPM > TARGET_WPM + 10) {
      return fail(res, payload.n, 'receipt_timing',
        'Server-side timing does not match. Suspicious activity.');
    }
  }

  // Check receipt positions are reasonable (increasing)
  for (let i = 1; i < verified.length; i++) {
    if (verified[i].p <= verified[i - 1].p) {
      return fail(res, payload.n, 'receipt_order',
        'Progress checkpoint positions are not sequential.');
    }
  }

  // ── 9. Anti-bot: keystroke timing variance ──
  const intervals = [];
  for (let i = 1; i < keystrokes.length; i++) {
    intervals.push(keystrokes[i] - keystrokes[i - 1]);
  }

  if (intervals.length > 5) {
    const mean     = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
    const stdDev   = Math.sqrt(variance);

    // Bots type with robotic consistency (low stdDev)
    if (stdDev < 12) {
      return fail(res, payload.n, 'bot_detected',
        'Suspicious typing pattern detected. Are you a robot?');
    }

    // Superhuman speed: >25% of intervals under 20ms
    const superFast = intervals.filter(i => i < 20).length;
    if (superFast > intervals.length * 0.25) {
      return fail(res, payload.n, 'superhuman',
        'Superhuman keystroke speed detected. Nice try, bot.');
    }
  }

  // ── ALL 9 CHECKS PASSED → return flag ──
  usedTokens.add(payload.n);
  return res.status(200).json({
    success: true,
    wpm: wpmRound,
    flag: FLAG,
    message: `Perfect! ${wpmRound} WPM. The vault is open.`
  });
};
