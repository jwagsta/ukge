let mappingPromise: Promise<Record<string, string>> | null = null;
let mappingData: Record<string, string> | null = null;

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
