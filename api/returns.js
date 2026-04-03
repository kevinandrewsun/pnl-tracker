export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const API_KEY = process.env.MARKET_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "MARKET_API_KEY not configured" });
  }

  const { tickers, targetDate } = req.body;
  if (!tickers || !Array.isArray(tickers)) {
    return res.status(400).json({ error: "tickers array required" });
  }
  if (!targetDate) {
    return res.status(400).json({ error: "targetDate required" });
  }

  // Build a date range: 10 days before target to target date
  // This ensures we capture the target date and the prior trading day
  const to = targetDate;
  const fromD = new Date(targetDate);
  fromD.setDate(fromD.getDate() - 10);
  const from = fromD.toISOString().split("T")[0];

  const returns = {};

  const batchSize = 10;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (ticker) => {
        try {
          const symbol = normalizeSymbol(ticker);
          const url = `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${symbol}&from=${from}&to=${to}`;

          const resp = await fetch(url, {
            headers: { "apikey": API_KEY },
          });
          if (!resp.ok) return;

          const data = await resp.json();
          if (!Array.isArray(data) || data.length < 2) return;

          // Data is sorted newest first
          // Find the target date entry and the one right after it (prior trading day)
          const targetIdx = data.findIndex((d) => d.date === targetDate);

          if (targetIdx !== -1 && targetIdx + 1 < data.length) {
            const targetPrice = data[targetIdx].price;
            const priorPrice = data[targetIdx + 1].price;

            if (priorPrice > 0) {
              returns[ticker] = (targetPrice - priorPrice) / priorPrice;
            }
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