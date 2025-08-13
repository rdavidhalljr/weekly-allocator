
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Slider } from "./components/ui/slider";
import { Input } from "./components/ui/input";
import { TrendingUp, LineChart, Settings, RefreshCcw } from "lucide-react";
import { LineChart as RLineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const TICKERS = [
  { symbol: "VOO", name: "Vanguard S&P 500 ETF" },
  { symbol: "BRK.B", name: "Berkshire Hathaway Class B" },
  { symbol: "NVDA", name: "NVIDIA Corporation" },
] as const;

type Provider = "stooq" | "finnhub" | "alphavantage";

function fmt(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function stdev(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

function slope(y: number[]) {
  const n = y.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    num += dx * (y[i] - yMean);
    den += dx * dx;
  }
  return num / den;
}

function slopeScore(prices: number[]) {
  if (prices.length < 5) return 0;
  const recent = prices.slice(-20);
  const s = slope(recent);
  const vol = stdev(recent);
  return vol ? s / vol : 0;
}

function momentumScore(prices: number[]) {
  if (prices.length < 21) return 0;
  const emaFast = ema(prices, 10);
  const emaSlow = ema(prices, 20);
  const diff = emaFast[emaFast.length - 1] - emaSlow[emaSlow.length - 1];
  const base = emaSlow[emaSlow.length - 1] || 1;
  return diff / base;
}

function compositeScore(prices: number[], weights: { slopeW: number; momentumW: number; recentW: number }) {
  const { slopeW, momentumW, recentW } = weights;
  if (prices.length < 5) return -Infinity;
  const s1 = slopeScore(prices);
  const s2 = momentumScore(prices);
  const recent = prices.slice(-5);
  const r = (recent[recent.length - 1] - recent[0]) / (recent[0] || 1);
  return slopeW * s1 + momentumW * s2 + recentW * r;
}

function mapSymbol(symbol: string, provider: Provider) {
  if (provider === "stooq") {
    if (symbol === "BRK.B") return "brk-b.us";
    return symbol.toLowerCase() + ".us";
  }
  return symbol;
}

// ---- Historical data fetchers ----
async function fetchStooqDaily(symbol: string) { // unused directly; keeping for reference
  const url = `https://stooq.com/q/d/l/?s=${symbol}&i=d`;
  const res = await fetch(url);
  const csv = await res.text();
  const rows = csv.trim().split(/\n+/).slice(1).map((r) => r.split(","));
  return rows.map(([date, _o, _h, _l, c]) => ({ date, close: Number(c) })).filter(x => !Number.isNaN(x.close));
}

async function fetchFinnhub(symbol: string, apiKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const yearAgo = now - 400 * 24 * 3600;
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${yearAgo}&to=${now}&token=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Finnhub error");
  const j = await res.json();
  if (j.s !== "ok") throw new Error("Finnhub: bad status");
  return j.t.map((t: number, i: number) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: j.c[i] }));
}

async function fetchAlphaVantage(symbol: string, apiKey: string) {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Alpha Vantage error");
  const j = await res.json();
  const series = j["Time Series (Daily)"] || {};
  const rows = Object.entries(series).map(([date, o]: any) => ({ date, close: Number((o as any)["4. close"]) }));
  rows.sort((a: any, b: any) => (a.date < b.date ? -1 : 1));
  return rows;
}

// ---- Live quote fetchers ----
async function fetchFinnhubQuote(symbol: string, apiKey: string) { // now proxied via /api
  const url = `/api/quote?provider=finnhub&symbol=${encodeURIComponent(symbol)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Finnhub quote error");
  const j = await res.json(); // { c, d, dp, h, l, o, pc, t }
  return { price: Number(j.c), ts: Number(j.t) ? new Date(Number(j.t) * 1000).toISOString() : null };
}

async function fetchAlphaVantageQuote(symbol: string, apiKey: string) { // now proxied via /api
  const url = `/api/quote?provider=alphavantage&symbol=${encodeURIComponent(symbol)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Alpha Vantage quote error");
  const j = await res.json();
  const q = j["Global Quote"] || {};
  const px = Number(q["05. price"] || q["05. Price"] || q["05. PRICE"]);
  const ts = (q["07. latest trading day"] as string) || null;
  return { price: px, ts };
}

async function fetchSeries(provider: Provider, symbol: string, apiKey?: string) { // proxied through /api
  const mapped = mapSymbol(symbol, provider);
  if (provider === "stooq") { const r = await fetch(`/api/series?provider=stooq&symbol=${symbol}`); const j = await r.json(); return j.series || []; }
  if (provider === "finnhub" && apiKey) { const r = await fetch(`/api/series?provider=finnhub&symbol=${symbol}`); const j = await r.json(); return j.series || []; }
  if (provider === "alphavantage" && apiKey) { const r = await fetch(`/api/series?provider=alphavantage&symbol=${symbol}`); const j = await r.json(); return j.series || []; }
  return fetchStooqDaily(mapSymbol(symbol, "stooq"));
}

export default function App() {
  const [provider, setProvider] = useState<Provider>("stooq");
  const [apiKey, setApiKey] = useState<string>("");
  const [series, setSeries] = useState<Record<string, { date: string; close: number }[]>>({});
  const [quotes, setQuotes] = useState<Record<string, { price: number | null; ts: string | null }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weights, setWeights] = useState({ slopeW: 0.5, momentumW: 0.35, recentW: 0.15 });
  const [refreshSec, setRefreshSec] = useState(60);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data: Record<string, { date: string; close: number }[]> = {};
      const q: Record<string, { price: number | null; ts: string | null }> = {};

      for (const t of TICKERS) {
        // historical
        data[t.symbol] = await fetchSeries(provider, t.symbol, apiKey.trim() || undefined);

        // live quote if available
        if (provider === "finnhub" && apiKey.trim()) {
          try {
            q[t.symbol] = await fetchFinnhubQuote(t.symbol, apiKey.trim());
          } catch (e) {
            q[t.symbol] = { price: null, ts: null };
          }
        } else if (provider === "alphavantage" && apiKey.trim()) {
          try {
            q[t.symbol] = await fetchAlphaVantageQuote(t.symbol, apiKey.trim());
          } catch (e) {
            q[t.symbol] = { price: null, ts: null };
          }
        } else {
          q[t.symbol] = { price: null, ts: null }; // stooq or no key
        }
      }

      setSeries(data);
      setQuotes(q);
    } catch (e: any) {
      setError(e.message || "Failed to fetch prices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, Math.max(30, refreshSec) * 1000);
    return () => clearInterval(id);
  }, [provider, apiKey, refreshSec]);

  const latestPrices = useMemo(() => {
    const out: Record<string, { display: number | null; source: "quote" | "close"; ts: string | null }> = {};
    for (const t of TICKERS) {
      const s = series[t.symbol] || [];
      const lastClose = s.length ? s[s.length - 1].close : null;
      const q = quotes[t.symbol];
      if (q && Number.isFinite(q.price as number)) {
        out[t.symbol] = { display: Number(q.price), source: "quote", ts: q.ts };
      } else {
        out[t.symbol] = { display: lastClose, source: "close", ts: s.length ? s[s.length - 1].date : null };
      }
    }
    return out;
  }, [series, quotes]);

  const scores = useMemo(() => {
    const sc: Record<string, number> = {};
    for (const t of TICKERS) {
      const closes = (series[t.symbol] || []).map((d) => d.close);
      sc[t.symbol] = compositeScore(closes, weights);
    }
    return sc;
  }, [series, weights]);

  const recommendation = useMemo(() => {
    const entries = Object.entries(scores).filter(([, v]) => Number.isFinite(v));
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }, [scores]);

  const gradientBg =
    "bg-[radial-gradient(80rem_80rem_at_80%_-10%,rgba(99,102,241,0.18),transparent),radial-gradient(60rem_60rem_at_-10%_-10%,rgba(34,197,94,0.16),transparent),linear-gradient(180deg,#0b1020,#060913)]";

  return (
    <div className={`min-h-screen ${gradientBg} text-white`}>
      <div className="max-w-6xl mx-auto px-4 py-10">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/10 backdrop-blur shadow-sm flex items-center justify-center">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Weekly Allocator</h1>
              <p className="text-sm text-white/70">VOO · BRK.B · NVDA — Wealthfront‑inspired clarity</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={refresh} className="rounded-2xl"><RefreshCcw className="h-4 w-4" /> Refresh</Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Prices + Charts */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium">Live Prices</h2>
                  <div className="text-xs text-white/60">
                    Provider: {provider.toUpperCase()} {provider !== "stooq" && !apiKey ? "(no key → fallback)" : ""} · Live when available
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {TICKERS.map((t) => (
                    <div key={t.symbol} className="rounded-2xl p-4 bg-white/5 border border-white/10">
                      <div className="text-white/70 text-xs">{t.name}</div>
                      <div className="text-2xl font-semibold mt-1">
                        {latestPrices[t.symbol]?.display != null ? fmt(latestPrices[t.symbol]!.display as number) : "—"}
                      </div>
                      <div className="text-white/60 text-xs mt-1">
                        {t.symbol} · {latestPrices[t.symbol]?.source === "quote" ? "Live" : "Close"}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </div>

            <div>
              <div className="flex gap-2 bg-white/10 rounded-2xl p-1">
                {TICKERS.map((t) => (
                  <div key={t.symbol} className="px-3 py-1 rounded-xl bg-white/10 text-sm">{t.symbol}</div>
                ))}
              </div>
              {TICKERS.map((t) => {
                const s = series[t.symbol] || [];
                const chartData = s.map((d) => ({ date: d.date.slice(2), close: d.close }));
                return (
                  <div key={t.symbol} className="mt-4 glass">
                    <CardContent className="p-4">
                      <div className="h-64 md:h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <RLineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} domain={["dataMin", "dataMax"]} />
                            <RTooltip />
                            <Line type="monotone" dataKey="close" stroke="#a5b4fc" strokeWidth={2} dot={false} />
                          </RLineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Recommendation & Settings */}
          <div className="space-y-6">
            <div className="glass">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <LineChart className="h-5 w-5" />
                  <h2 className="text-lg font-medium">This Week's Recommendation</h2>
                </div>
                {recommendation ? (
                  <div>
                    <div className="text-4xl font-semibold mb-1">{recommendation}</div>
                    <div className="text-white/70 text-sm mb-4">Based on momentum & trend vs. volatility.</div>
                    <div className="grid grid-cols-3 gap-2">
                      {TICKERS.map((t) => (
                        <div key={t.symbol} className={`rounded-2xl p-3 border ${recommendation === t.symbol ? "bg-emerald-400/15 border-emerald-300/30" : "bg-white/5 border-white/10"}`}>
                          <div className="text-xs text-white/60">{t.symbol}</div>
                          <div className="text-lg font-semibold">{Number.isFinite(scores[t.symbol]) ? scores[t.symbol].toFixed(3) : "—"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-white/70">Fetching data…</div>
                )}
              </CardContent>
            </div>

            <div className="glass">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2"><Settings className="h-5 w-5" /><h3 className="text-base font-medium">Settings</h3></div>

                <div className="space-y-2">
                  <label className="text-sm text-white/80">Data Provider</label>
                  <div className="flex gap-2 flex-wrap">
                    <Button className="rounded-xl" onClick={()=>setProvider("stooq")}>Stooq (free)</Button>
                    <Button className="rounded-xl" onClick={()=>setProvider("finnhub")}>Finnhub</Button>
                    <Button className="rounded-xl" onClick={()=>setProvider("alphavantage")}>Alpha Vantage</Button>
                  </div>
                </div>

                {provider !== "stooq" && (
                  <div className="space-y-2">
                    <label className="text-sm text-white/80">API Key ({provider})</label>
                    <Input value={apiKey} onChange={(e:any) => setApiKey(e.target.value)} placeholder="Paste your API key" />
                    <p className="text-xs text-white/60">Optional. Without a key, prices use Stooq (daily). With a key, you'll see Live quotes when the market trades; otherwise last Close.</p>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/80">Weight: Trend (slope/vol)</span>
                    <span className="text-sm text-white/60">{weights.slopeW.toFixed(2)}</span>
                  </div>
                  <Slider value={[weights.slopeW]} min={0} max={1} step={0.01} onValueChange={([v]) => setWeights(w => ({ ...w, slopeW: v }))} />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/80">Weight: EMA Momentum</span>
                    <span className="text-sm text-white/60">{weights.momentumW.toFixed(2)}</span>
                  </div>
                  <Slider value={[weights.momentumW]} min={0} max={1} step={0.01} onValueChange={([v]) => setWeights(w => ({ ...w, momentumW: v }))} />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/80">Weight: 5‑day Return</span>
                    <span className="text-sm text-white/60">{weights.recentW.toFixed(2)}</span>
                  </div>
                  <Slider value={[weights.recentW]} min={0} max={1} step={0.01} onValueChange={([v]) => setWeights(w => ({ ...w, recentW: v }))} />
                  <p className="text-xs text-white/50">For informational purposes only; not financial advice.</p>
                </div>
              </CardContent>
            </div>
          </div>
        </div>

        <footer className="mt-10 text-center text-white/50 text-xs">© {new Date().getFullYear()} David — Weekly Allocator</footer>
      </div>
    </div>
  );
}
