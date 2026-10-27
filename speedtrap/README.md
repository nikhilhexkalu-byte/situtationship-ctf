# Speed Trap — CyberHeist CTF

An AI-proof typing-speed challenge. Players must type a randomly assigned paragraph at **exactly 35 WPM** to open the vault and reveal the flag. Too fast trips the alarm; too slow resets it.

## Endpoints
- `GET /api/session` — issues an HMAC-signed token + a random paragraph
- `POST /api/progress` — issues server-signed receipts every 15 characters (proves real-time typing)
- `POST /api/check` — runs 9 server-side validation layers, returns the flag only if all pass

The flag lives **only** in a Vercel environment variable — it never appears in the source.

## Deploy on Vercel
1. Import this repo into Vercel and set **Root Directory** to `speedtrap/`.
2. Add these environment variables:

   | Variable | Value |
   |---|---|
   | `CTF_SECRET` | random string — e.g. `openssl rand -hex 32` |
   | `CTF_FLAG` | your flag, e.g. `CyberHeist{...}` |
   | `CTF_TARGET_WPM` | `35` |
   | `CTF_TOLERANCE` | `2` |

3. Deploy. The typing test is served at `/`.

> `CTF_FLAG` is required — if it is not set, `/api/check` returns a 500 instead of ever exposing a fallback flag.

## Anti-cheat layers
1. Typed text must match the assigned paragraph exactly
2. Server-side elapsed-time check (token issue time vs submission time)
3. 5+ server-signed progress receipts, spaced over real time
4. Client WPM within target ± tolerance
5. Server-side WPM from receipt timestamps cross-checked
6. Keystroke-variance analysis (bots type too consistently)
7. Superhuman-speed detection (sub-20 ms intervals)
8. Single-use tokens (anti-replay)
9. HMAC-signed sessions (tamper-proof paragraph assignment)
