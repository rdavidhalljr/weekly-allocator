export default async function handler(req, res) {
  try {
    const { provider = 'stooq', symbol = '' } = req.query || {};
    if (!symbol) {
      res.status(400).json({ error: 'symbol required' });
      return;
    }
    if (provider === 'stooq') {
      const mapped = symbol === 'BRK.B' ? 'brk-b.us' : symbol.toLowerCase() + '.us';
      const url = `https://stooq.com/q/d/l/?s=${mapped}&i=d`;
      const r = await fetch(url);
      const csv = await r.text();
      const rows = csv.trim().split(/\n+/).slice(1).map(line => line.split(','));
      const out = rows.map(([date, _o, _h, _l, c]) => ({ date, close: Number(c) })).filter(x => Number.isFinite(x.close));
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      res.status(200).json({ ok: true, series: out });
      return;
    }
    if (provider === 'finnhub') {
      const key = process.env.FINNHUB_API_KEY;
      if (!key) { res.status(400).json({ error: 'FINNHUB_API_KEY not set' }); return; }
      const now = Math.floor(Date.now() / 1000);
      const yearAgo = now - 400 * 24 * 3600;
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${yearAgo}&to=${now}&token=${key}`;
      const r = await fetch(url);
      const j = await r.json();
      if (j.s !== 'ok') { res.status(502).json({ error: 'finnhub bad status', raw: j }); return; }
      const out = j.t.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0,10), close: j.c[i] }));
      res.status(200).json({ ok: true, series: out });
      return;
    }
    if (provider === 'alphavantage') {
      const key = process.env.ALPHAVANTAGE_API_KEY;
      if (!key) { res.status(400).json({ error: 'ALPHAVANTAGE_API_KEY not set' }); return; }
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${key}`;
      const r = await fetch(url);
      const j = await r.json();
      const series = j['Time Series (Daily)'] || {};
      const rows = Object.entries(series).map(([date, o]) => ({ date, close: Number(o['4. close']) }));
      rows.sort((a,b) => a.date < b.date ? -1 : 1);
      res.status(200).json({ ok: true, series: rows });
      return;
    }
    res.status(400).json({ error: 'unknown provider' });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
