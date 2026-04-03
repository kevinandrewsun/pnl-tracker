/**
 * Fetch single-day returns for an array of tickers on a specific date.
 * Returns: { AAPL: 0.0011, NVDA: -0.0112, ... } (decimal returns)
 */
export async function fetchDailyReturns(tickers, targetDate) {
  try {
    const res = await fetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers, targetDate }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("Failed to fetch returns:", e);
    return {};
  }
}

/**
 * Fetch historical prices for a single ticker over a date range.
 * Returns: [{ date: "2026-01-02", price: 245.50, volume: 30000000 }, ...]
 * Sorted oldest first.
 */
export async function fetchHistoricalPrices(ticker, from, to) {
  try {
    const res = await fetch("/api/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, from, to }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    // FMP returns newest first, reverse to oldest first
    return Array.isArray(data) ? data.reverse() : [];
  } catch (e) {
    console.error("Failed to fetch prices:", e);
    return [];
  }
}

/**
 * Given a list of position entries, extract unique tickers.
 */
export function extractTickers(entries) {
  return [...new Set(entries.map((e) => e.ticker))];
}

/**
 * Format fetched returns into the paste-ready string format.
 */
export function returnsToText(returns) {
  return Object.entries(returns)
    .map(([ticker, ret]) => {
      const pct = (ret * 100).toFixed(4);
      return `${ticker}\t${pct}`;
    })
    .join("\n");
}