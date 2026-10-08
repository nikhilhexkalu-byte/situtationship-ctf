const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());

const F = {
  bio:    'ctf{the_bio_said_no_liars_but_the_source_did}',
  ex:     'ctf{everyone_has_an_ex_with_id_7}',
  inbox:  'ctf{its_complicated_and_so_are_cookies}',
  robots: 'ctf{stalking_robots_txt_is_not_a_red_flag}',
  letter: 'ctf{rot13_then_base64_he_meant_it}',
  dm:     'ctf{he_texted_back_in_hex_finally}',
};

const rot13 = s => s.replace(/[a-z]/gi, c => {
  const b = c <= 'Z' ? 65 : 97;
  return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b);
});
const LETTER = Buffer.from(rot13('dear you, i kept this safe for you: ' + F.letter)).toString('base64');
const DM = Buffer.from([...('read me backwards: ' + [...F.dm].reverse().join(''))].join('')).toString('hex');

const challenges = [
  { id: 'bio', pts: 50, cat: 'web', title: 'Read the Fine Print',
    desc: 'Maya\'s profile says she hates liars. Her page might be hiding something she didn\'t want to say out loud.',
    link: '/profile/maya' },
  { id: 'robots', pts: 75, cat: 'recon', title: 'Do Not Crawl Me',
    desc: 'Some sites ask politely to be left alone. The polite ask itself is a file.',
    link: '/robots.txt' },
  { id: 'inbox', pts: 100, cat: 'web', title: 'It\'s Complicated',
    desc: 'The inbox only opens up for people whose status is a little more interesting than "single". The app trusts you to tell it the truth.',
    link: '/inbox' },
  { id: 'ex', pts: 150, cat: 'web', title: 'Mutual Friends',
    desc: 'The app shows you profiles 1 to 6. Everyone has an ex though. Check how the API hands them out.',
    link: '/api/profile/1' },
  { id: 'letter', pts: 150, cat: 'crypto', title: 'Dear You',
    desc: 'A handwritten letter, scanned in as text. He scrambled it twice because he was shy. Two simple steps, in some order.',
    link: '/letter.txt' },
  { id: 'dm', pts: 200, cat: 'crypto', title: 'Seen 11:48 PM',
    desc: 'Pulled from the DM endpoint. The message is hex. The sender was having a bad night, and reads right to left in his head.',
    link: '/api/dm' },
];

const profiles = {
  1: { name: 'Jordan', age: 27, bio: 'Climbs things. Reply with your best pun.' },
  2: { name: 'Priya', age: 29, bio: 'Looking for someone who cooks. I will do the dishes.' },
  3: { name: 'Theo', age: 31, bio: 'Vinyl, bad takes, good dogs.' },
  4: { name: 'Sam', age: 26, bio: 'No small talk after midnight.' },
  5: { name: 'Lena', age: 30, bio: 'Slow replies, big feelings.' },
  6: { name: 'Marcus', age: 28, bio: 'Ask me about my sourdough.' },
  7: { name: 'REDACTED', age: null, bio: 'do not show this one to anyone', private_note: F.ex },
};

const board = {}; // nick -> { solved: Set, pts, last }

app.get('/profile/maya', (req, res) => {
  res.type('html').send(`<!doctype html><title>maya, 28</title>
<body style="font:16px Georgia;background:#efe6d3;padding:40px;max-width:520px">
<h1>Maya, 28</h1><p>Looking for: honesty. Dealbreakers: liars, people who say "haha" instead of laughing.</p>
<p>Last active: a while ago.</p>
<!-- TODO: remove before launch. note to self: ${F.bio} -->
</body>`);
});

app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nDisallow: /exes-archive.txt\n'));
app.get('/exes-archive.txt', (req, res) => res.type('text').send('Archive of people I should not text.\n\n' + F.robots + '\n'));

app.get('/inbox', (req, res) => {
  const c = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(x => x.trim().split('=')));
  if (!c.status) res.setHeader('Set-Cookie', 'status=single; Path=/');
  if (c.status === 'complicated') return res.type('text').send('Inbox (1 new)\n\n' + F.inbox);
  res.type('text').status(403).send('Inbox locked. Relationship status: ' + (c.status || 'single') + '. Come back when it is more interesting.');
});

app.get('/api/profile/:id', (req, res) => {
  const p = profiles[req.params.id];
  if (!p) return res.status(404).json({ error: 'no such person' });
  res.json(p);
});
app.get('/letter.txt', (req, res) => res.type('text').send(LETTER + '\n'));
app.get('/api/dm', (req, res) => res.json({ from: 'unknown', sent: '23:48', body_hex: DM }));

app.get('/api/challenges', (req, res) => res.json(challenges));
app.get('/api/board', (req, res) => res.json(
  Object.entries(board).map(([nick, v]) => ({ nick, pts: v.pts, solved: v.solved.size, last: v.last }))
    .sort((a, b) => b.pts - a.pts || a.last - b.last).slice(0, 20)));

app.post('/api/submit', (req, res) => {
  const nick = String(req.body.nick || '').replace(/[^\w .-]/g, '').slice(0, 20).trim();
  const ch = challenges.find(c => c.id === req.body.id);
  if (!nick) return res.status(400).json({ ok: false, msg: 'Pick a nickname first.' });
  if (!ch) return res.status(400).json({ ok: false, msg: 'Unknown challenge.' });
  const u = board[nick] || (board[nick] = { solved: new Set(), pts: 0, last: Date.now() });
  if (u.solved.has(ch.id)) return res.json({ ok: true, msg: 'Already solved.' });
  if (String(req.body.flag || '').trim() !== F[ch.id]) return res.json({ ok: false, msg: 'Nope. Ghosted.' });
  u.solved.add(ch.id); u.pts += ch.pts; u.last = Date.now();
  res.json({ ok: true, msg: `Match! +${ch.pts}` });
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(process.env.PORT || 3000, () => console.log('up'));
