export interface WikipediaSummary {
  title: string;
  extract: string;
  thumbnail?: { source: string; width: number; height: number };
  contentUrl: string;
  status: 'loaded' | 'error' | 'not_found';
}

// Module-level caches
const summaryCache = new Map<string, WikipediaSummary>();
const MAX_SUMMARY_CACHE = 30;

let mappingPromise: Promise<Record<string, string>> | null = null;
let mappingData: Record<string, string> | null = null;

// Rate limiting: queue requests 100ms apart
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100;

async function throttledFetch(url: string, signal?: AbortSignal): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
  return fetch(url, {
    headers: { 'Api-User-Agent': 'UKGEVisualization/1.0 (https://github.com/jwagsta/ukge)' },
    signal,
  });
}

export async function loadMapping(): Promise<Record<string, string>> {
  if (mappingData) return mappingData;
  if (mappingPromise) return mappingPromise;

  mappingPromise = (async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/wikipedia/constituencyMapping.json`);
      if (!response.ok) throw new Error('Failed to load Wikipedia mapping');
      const data = await response.json();
      mappingData = data.constituencies as Record<string, string>;
      return mappingData;
    } catch {
      mappingData = {};
      return mappingData;
    }
  })();

  return mappingPromise;
}

export function getConstituencyArticleTitle(constituencyId: string): Promise<string | null> {
  return loadMapping().then((mapping) => mapping[constituencyId] ?? null);
}

export function getElectionArticleTitle(year: number): string {
  if (year === 197402) return 'February_1974_United_Kingdom_general_election';
  if (year === 197410) return 'October_1974_United_Kingdom_general_election';
  return `${year}_United_Kingdom_general_election`;
}

export function getArticleUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${title}`;
}

export async function fetchSummary(
  articleTitle: string,
  signal?: AbortSignal
): Promise<WikipediaSummary> {
  // Check cache
  const cached = summaryCache.get(articleTitle);
  if (cached) return cached;

  try {
    const response = await throttledFetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`,
      signal
    );

    if (response.status === 404) {
      const result: WikipediaSummary = {
        title: articleTitle.replace(/_/g, ' '),
        extract: '',
        contentUrl: getArticleUrl(articleTitle),
        status: 'not_found',
      };
      evictAndCache(articleTitle, result);
      return result;
    }

    if (!response.ok) {
      throw new Error(`Wikipedia API error: ${response.status}`);
    }

    const data = await response.json();
    const result: WikipediaSummary = {
      title: data.title || articleTitle.replace(/_/g, ' '),
      extract: data.extract || '',
      thumbnail: data.thumbnail
        ? { source: data.thumbnail.source, width: data.thumbnail.width, height: data.thumbnail.height }
        : undefined,
      contentUrl: data.content_urls?.desktop?.page || getArticleUrl(articleTitle),
      status: 'loaded',
    };

    evictAndCache(articleTitle, result);
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error; // Let abort errors propagate
    }
    const result: WikipediaSummary = {
      title: articleTitle.replace(/_/g, ' '),
      extract: '',
      contentUrl: getArticleUrl(articleTitle),
      status: 'error',
    };
    // Cache errors briefly to avoid hammering
    evictAndCache(articleTitle, result);
    return result;
  }
}

function evictAndCache(key: string, value: WikipediaSummary) {
  if (summaryCache.size >= MAX_SUMMARY_CACHE) {
    const firstKey = summaryCache.keys().next().value;
    if (firstKey) summaryCache.delete(firstKey);
  }
  summaryCache.set(key, value);
}
