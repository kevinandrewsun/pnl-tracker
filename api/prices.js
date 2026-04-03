export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const API_KEY = process.env.MARKET_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "MARKET_API_KEY not configured" });
  }

  const { ticker, from, to } = req.body;
  if (!ticker) {
    return res.status(400).json({ error: "ticker required" });
  }

  try {
    const symbol = normalizeSymbol(ticker);
    const url = `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${symbol}&from=${from}&to=${to}`;

    const resp = await fetch(url, {
      headers: { "apikey": API_KEY },
    });

    if (!resp.ok) {
      return res.status(resp.status).json({ error: "FMP API error" });
    }

    const data = await resp.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function normalizeSymbol(ticker) {
  if (ticker.endsWith(".TYS")) return ticker.replace(".TYS", ".T");
  return ticker;
}