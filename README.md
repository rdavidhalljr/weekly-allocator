# Weekly Allocator (VOO · BRK.B · NVDA)

A beautiful, Wealthfront‑inspired web app that fetches prices for VOO, BRK.B, and NVDA and recommends where to put your weekly contribution based on a volatility‑adjusted trend score.

## One‑Minute Deploy (Vercel or Netlify)

### Option A: Vercel (easiest)
1) Go to https://vercel.com and sign in.
2) Click **Add New → Project → Import** and **drag‑and‑drop this folder** (or the ZIP) into Vercel.
3) Accept defaults and click **Deploy**. That’s it.
   - Optional: set **Environment Variables** (FINNHUB_API_KEY or ALPHAVANTAGE_API_KEY) if you want near real‑time data. Otherwise it uses free daily quotes automatically.

### Option B: Netlify
1) Go to https://app.netlify.com → **Add new site → Import an existing project** → **Drag‑and‑drop** this folder/ZIP.
2) Build command: `npm run build` — Publish directory: `dist`.
3) Click **Deploy site**. Done.

## Local Run (optional)
```bash
npm install
npm run dev
```
Open http://localhost:5173

## Notes
- BRK.B is handled for Stooq (`brk-b.us`), so it “just works”.
- If you add API keys, choose the provider in **Settings** inside the app.
- This is not financial advice. For information only.
