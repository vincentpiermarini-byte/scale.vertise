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
      let stats = await getStats();
      /* ── auto-refresh from Meta Marketing API when configured ──
         Set META_TOKEN (system-user token, ads_read) and
         META_AD_ACCOUNT (like act_1234567890) in Vercel env.
         Refreshes lazily when data is older than 6h, or force
         with ?refresh=1. */
      const MT = process.env.META_TOKEN, MA = process.env.META_AD_ACCOUNT;
      const stale = !stats.metaFetched || (Date.now() - stats.metaFetched) > 6 * 3600 * 1000;
      if (MT && MA && (stale || req.query.refresh === '1')) {
        try {
          const acct = MA.startsWith('act_') ? MA : 'act_' + MA;
          const url = 'https://graph.facebook.com/v21.0/' + acct + '/insights' +
            '?fields=spend,reach,impressions,frequency,actions' +
            '&date_preset=last_30d&access_token=' + encodeURIComponent(MT);
          const r = await fetch(url);
          const j = await r.json();
          const row = j && j.data && j.data[0];
          if (row) {
            stats.spend = Number(row.spend) || 0;
            stats.reach = Number(row.reach) || 0;
            stats.impressions = Number(row.impressions) || 0;
            stats.frequency = Number(row.frequency) || 0;
            const leadAction = (row.actions || []).find(a =>
              a.action_type === 'lead' ||
              a.action_type === 'leadgen_grouped' ||
              a.action_type === 'onsite_conversion.lead_grouped');
            if (leadAction) stats.metaLeads = Number(leadAction.value) || 0;
            stats.metaFetched = Date.now();
            stats.updated = Date.now();
            stats.auto = true;
            await setStats(stats);
          } else if (j && j.error) {
            stats.metaError = j.error.message || 'meta_error';
          }
        } catch (e) { /* keep serving cached numbers */ }
      }
      return res.status(200).json({ ok: true, stats, auto: !!(MT && MA) });
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
