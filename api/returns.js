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

  // Add buffer days to ensure we capture enough trading days
  // (weekends, holidays, and unsettled today data)
  const from = new Date(fromDate);
  from.setDate(from.getDate() - 5);
  const bufferedFrom = from.toISOString().split("T")[0];

  const to = new Date(toDate);
  to.setDate(to.getDate() - 1);
  const bufferedTo = to.toISOString().split("T")[0];

  const returns = {};

  const batchSize = 10;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (ticker) => {
        try {
          const symbol = normalizeSymbol(ticker);
          const url = `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${symbol}&from=${bufferedFrom}&to=${bufferedTo}`;

          const resp = await fetch(url, {
            headers: { "apikey": API_KEY },
          });
          if (!resp.ok) return;

          const data = await resp.json();
          if (!Array.isArray(data) || data.length < 2) return;

          // Data comes sorted newest first
          // Use the two most recent trading days
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