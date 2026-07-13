/* Pet Scoop ad-performance store — Vercel serverless + KV.
   Holds one small object of ad numbers (spend, reach, impressions,
   frequency, Meta-reported leads, price) so every phone sees the same
   analytics. Punch them in from the app weekly, OR later have Zapier /
   the Meta Marketing API POST them here nightly — same endpoint.

   Env: KV_REST_API_URL, KV_REST_API_TOKEN, optional LEAD_TOKEN.
*/
const KEY = 'petscoop:adstats';

async function kv(cmd) {
  const r = await fetch(process.env.KV_REST_API_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.KV_REST_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  return j.result;
}
async function getStats() {
  const raw = await kv(['GET', KEY]);
  try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
}
async function setStats(o) { await kv(['SET', KEY, JSON.stringify(o)]); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(200).json({ ok: false, error: 'no_database' });
  }
  const SECRET = process.env.LEAD_TOKEN || 'petscoop-live-7Kq2mZ9fLxW4';
  const body = typeof req.body === 'string' ? safe(req.body) : (req.body || {});
  const token = req.method === 'GET' ? (req.query.token || '') : (body.token || '');
  if (token !== SECRET) return res.status(200).json({ ok: false, error: 'bad_token' });

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, stats: await getStats() });
    }
    const cur = await getStats();
    // accept either { stats:{...} } or flat fields for Zapier convenience
    const incoming = body.stats && typeof body.stats === 'object' ? body.stats : body;
    const fields = ['spend', 'reach', 'impressions', 'frequency', 'metaLeads', 'price'];
    fields.forEach(f => { if (incoming[f] !== undefined && incoming[f] !== '') cur[f] = Number(incoming[f]); });
    cur.updated = Date.now();
    await setStats(cur);
    return res.status(200).json({ ok: true, stats: cur });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'store_error' });
  }
}
function safe(s) { try { return JSON.parse(s || '{}'); } catch (e) { return {}; } }
