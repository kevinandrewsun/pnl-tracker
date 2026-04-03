/**
 * Fetch daily returns for an array of tickers between two dates.
 * Routes through the /api/returns serverless function.
 * Returns: { AAPL: 0.0234, NVDA: -0.0112, ... } (decimal returns)
 */
export async function fetchDailyReturns(tickers, fromDate, toDate) {
  try {
    const res = await fetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers, fromDate, toDate }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch returns:", e);
    return {};
  }
}

/**
 * Given a list of position entries, extract unique tickers.
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