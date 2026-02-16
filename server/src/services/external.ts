export async function fetchCryptoPrice(coinId: string): Promise<{ price: number; currency: string; timestamp: string }> {
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd`);
    const data: any = await res.json();
    return {
      price: data[coinId]?.usd ?? 0,
      currency: 'usd',
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('CoinGecko fetch error:', err);
    return { price: 0, currency: 'usd', timestamp: new Date().toISOString() };
  }
}

export async function fetchNewsHeadlines(query: string): Promise<{ headlines: string[]; source: string; timestamp: string }> {
  // Using a free news API. In production, use a proper API key.
  try {
    const res = await fetch(`https://newsdata.io/api/1/news?apikey=pub_demo&q=${encodeURIComponent(query)}&language=en`);
    const data: any = await res.json();
    const headlines = (data.results || []).slice(0, 5).map((r: any) => r.title);
    return {
      headlines,
      source: 'newsdata.io',
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('News fetch error:', err);
    return {
      headlines: [`Unable to fetch news for "${query}"`],
      source: 'fallback',
      timestamp: new Date().toISOString(),
    };
  }
}

export async function fetchExternalData(dataSource: string, params: Record<string, any>): Promise<Record<string, any>> {
  if (dataSource === 'coingecko' || dataSource === 'crypto') {
    const coinId = params.coin_id || params.coinId || 'bitcoin';
    return await fetchCryptoPrice(coinId);
  }

  if (dataSource === 'news') {
    const query = params.query || params.keyword || 'latest';
    return await fetchNewsHeadlines(query);
  }

  return { error: `Unknown data source: ${dataSource}`, timestamp: new Date().toISOString() };
}
