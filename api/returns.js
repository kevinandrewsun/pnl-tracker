export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const API_KEY = process.env.MARKET_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "MARKET_API_KEY not configured" });
  }

  const { tickers, fromDate, toDate } = req.body;
  if (!tickers || !Array.isArray(tickers)) {
    return res.status(400).json({ error: "tickers array required" });
  }

  const returns = {};

  const batchSize = 10;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (ticker) => {
        try {
          const symbol = normalizeSymbol(ticker);
          const url = `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${symbol}&from=${fromDate}&to=${toDate}`;

          const resp = await fetch(url, {
            headers: { "apikey": API_KEY },
          });
          if (!resp.ok) return;

          const data = await resp.json();
          if (!Array.isArray(data) || data.length < 2) return;

          // Data comes sorted newest first
          const today = data[0];
          const yesterday = data[1];

          if (today && yesterday && yesterday.close > 0) {
            returns[ticker] = (today.close - yesterday.close) / yesterday.close;
          }
        } catch (e) {
          console.warn(`Failed to fetch ${ticker}:`, e.message);
        }
      })
    );

    // Small delay between batches
    if (i + batchSize < tickers.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return res.status(200).json(returns);
}

function normalizeSymbol(ticker) {
  if (ticker.endsWith(".TYS")) return ticker.replace(".TYS", ".T");
  return ticker;
}