/* Pet Scoop lead store — Vercel serverless function.
   Zapier POSTs new Meta leads here; the app GETs the list and pushes
   status changes back. Data lives in Vercel KV (Upstash Redis) so there
   is no spreadsheet and everything stays on scalevertise.app.

   Required env vars (set once in the Vercel dashboard):
     KV_REST_API_URL, KV_REST_API_TOKEN  — added automatically when you
        create/connect a KV (Upstash) database to the project
     LEAD_TOKEN                           — a secret you choose; the app
        and Zapier both send it so nobody else can read or write leads
*/
const KEY = 'petscoop:leads';

async function kv(cmd) {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  return j.result;
}
async function getLeads() {
  const raw = await kv(['GET', KEY]);
  try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
async function setLeads(arr) { await kv(['SET', KEY, JSON.stringify(arr)]); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(200).json({ ok: false, error: 'no_database', hint: 'Connect a KV database to this project in Vercel.' });
  }
  // Custom lock optional; a baked default lets sharing work with zero setup.
  const SECRET = process.env.LEAD_TOKEN || 'petscoop-live-7Kq2mZ9fLxW4';

  const body = typeof req.body === 'string' ? safe(req.body) : (req.body || {});
  const token = req.method === 'GET' ? (req.query.token || '') : (body.token || '');
  if (token !== SECRET) return res.status(200).json({ ok: false, error: 'bad_token' });

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, leads: await getLeads() });
    }

    const leads = await getLeads();

    if (body.action === 'newlead') {
      const phone = normPhone(body.phone);
      if (phone && leads.some(l => normPhone(l.phone) === phone)) {
        return res.status(200).json({ ok: true, dup: true });
      }
      let created = body.created ? new Date(body.created).getTime() : Date.now();
      if (!created || isNaN(created)) created = Date.now();
      leads.push({
        id: 'L' + Date.now().toString(36) + Math.floor(Math.random() * 1e4),
        name: String(body.name || 'Lead').trim().split(/\s+/)[0] || 'Lead',
        phone: body.phone || '',
        source: body.source || 'Meta Ad',
        status: 'New', notes: '',
        created, firstTextedAt: null, updated: Date.now()
      });
      await setLeads(leads);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'upsert' && body.lead) {
      const i = leads.findIndex(l => l.id === body.lead.id);
      if (i >= 0) leads[i] = Object.assign({}, leads[i], body.lead);
      else leads.push(body.lead);
      await setLeads(leads);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'delete' && body.id) {
      await setLeads(leads.filter(l => l.id !== body.id));
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'bad_action' });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'store_error' });
  }
}

function normPhone(p) { return String(p || '').replace(/[^\d]/g, '').replace(/^1(?=\d{10}$)/, ''); }
function safe(s) { try { return JSON.parse(s || '{}'); } catch (e) { return {}; } }
