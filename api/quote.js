export default async function handler(req, res) {
  try {
    const { provider = 'stooq', symbol = '' } = req.query || {};
    if (!symbol) { res.status(400).json({ error: 'symbol required' }); return; }
    if (provider === 'finnhub') {
      const key = process.env.FINNHUB_API_KEY;
      if (!key) { res.status(400).json({ error: 'FINNHUB_API_KEY not set' }); return; }
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`;
      const r = await fetch(url);
      const j = await r.json();
      res.status(200).json({ ok: true, quote: { price: Number(j.c), ts: j.t ? new Date(j.t * 1000).toISOString() : null } });
      return;
    }
    if (provider === 'alphavantage') {
      const key = process.env.ALPHAVANTAGE_API_KEY;
      if (!key) { res.status(400).json({ error: 'ALPHAVANTAGE_API_KEY not set' }); return; }
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
      const r = await fetch(url);
      const j = await r.json();
      const q = j['Global Quote'] || {};
      const px = Number(q['05. price'] || q['05. Price'] || q['05. PRICE']);
      const ts = q['07. latest trading day'] || null;
      res.status(200).json({ ok: true, quote: { price: px, ts } });
      return;
    }
    // stooq has no live quote; return empty
    res.status(200).json({ ok: true, quote: { price: null, ts: null } });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
