// ============================================================
// Market data — auto-fetch daily returns
// Uses Financial Modeling Prep (free tier: 250 req/day)
// Fallback: proxied via /api/returns serverless function
// ============================================================

const FMP_KEY = import.meta.env.VITE_MARKET_API_KEY;
const USE_SERVERLESS = !FMP_KEY; // Use Vercel function if no client key

/**
 * Fetch daily returns for an array of tickers between two dates.
 * Returns: { AAPL: 0.0234, NVDA: -0.0112, ... }  (decimal returns)
 */
export async function fetchDailyReturns(tickers, fromDate, toDate) {
  if (USE_SERVERLESS) {
    return fetchViaServerless(tickers, fromDate, toDate);
  }
  return fetchViaFMP(tickers, fromDate, toDate);
}

// ----- Financial Modeling Prep (client-side) -----
async function fetchViaFMP(tickers, fromDate, toDate) {
  const returns = {};

  // FMP supports batch quotes but historical needs per-ticker calls
  // We'll batch in chunks of 5 to stay under rate limits
  const chunks = [];
  for (let i = 0; i < tickers.length; i += 5) {
    chunks.push(tickers.slice(i, i + 5));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (ticker) => {
      try {
        // Adjust ticker format: remove suffixes like .TYS for Japanese stocks
        const symbol = normalizeSymbol(ticker);
        const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?from=${fromDate}&to=${toDate}&apikey=${FMP_KEY}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        const hist = data.historical;
        if (!hist || hist.length < 2) return;

        // hist is sorted newest first
        // Daily return = (close_today / close_yesterday) - 1
        const today = hist[0];
        const yesterday = hist[1];
        if (today && yesterday && yesterday.close > 0) {
          returns[ticker] = (today.close - yesterday.close) / yesterday.close;
        }
      } catch (e) {
        console.warn(`Failed to fetch ${ticker}:`, e.message);
      }
    });
    await Promise.all(promises);

    // Small delay between chunks to be respectful
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return returns;
}

// ----- Vercel serverless proxy -----
async function fetchViaServerless(tickers, fromDate, toDate) {
  try {
    const res = await fetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers, fromDate, toDate }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("Serverless fetch failed:", e);
    return {};
  }
}

// ----- Helpers -----

// Normalize ticker symbols for the API
// e.g., "7220.TYS" → "7220.T" (Tokyo), handle ADRs, etc.
function normalizeSymbol(ticker) {
  // Japanese stocks: .TYS → .T (Tokyo Stock Exchange on FMP)
  if (ticker.endsWith(".TYS")) return ticker.replace(".TYS", ".T");
  // Hong Kong: .HK stays as-is
  // London: .L stays as-is
  // Default: return as-is (US stocks)
  return ticker;
}

/**
 * Given a list of position entries, extract unique tickers
 * and determine the date range needed for returns.
 */
export function extractTickers(entries) {
  return [...new Set(entries.map((e) => e.ticker))];
}

/**
 * Format fetched returns into the paste-ready string format
 * the tracker already knows how to parse.
 */
export function returnsToText(returns) {
  return Object.entries(returns)
    .map(([ticker, ret]) => {
      const pct = (ret * 100).toFixed(4);
      return `${ticker}\t${pct}`;
    })
    .join("\n");
}