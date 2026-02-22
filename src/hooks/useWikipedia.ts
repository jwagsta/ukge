import { useState, useEffect, useRef } from 'react';
import type { WikipediaSummary } from '@/services/wikipedia';
import {
  fetchSummary,
  getConstituencyArticleTitle,
  getElectionArticleTitle,
  getArticleUrl,
} from '@/services/wikipedia';

interface WikipediaHookResult {
  summary: WikipediaSummary | null;
  isLoading: boolean;
  articleUrl: string | null;
}

export function useConstituencyWikipedia(constituencyId: string | null): WikipediaHookResult {
  const [summary, setSummary] = useState<WikipediaSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [articleUrl, setArticleUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Cancel previous request
    abortRef.current?.abort();
    abortRef.current = null;

    if (!constituencyId) {
      setSummary(null);
      setIsLoading(false);
      setArticleUrl(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);

    (async () => {
      try {
        const title = await getConstituencyArticleTitle(constituencyId);
        if (controller.signal.aborted) return;

        if (!title) {
          setSummary(null);
          setIsLoading(false);
          setArticleUrl(null);
          return;
        }

        setArticleUrl(getArticleUrl(title));
        const result = await fetchSummary(title, controller.signal);
        if (controller.signal.aborted) return;
        setSummary(result);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSummary(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [constituencyId]);

  return { summary, isLoading, articleUrl };
}

export function useElectionWikipedia(year: number): WikipediaHookResult {
  const [summary, setSummary] = useState<WikipediaSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [articleUrl, setArticleUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    const title = getElectionArticleTitle(year);
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setArticleUrl(getArticleUrl(title));

    (async () => {
      try {
        const result = await fetchSummary(title, controller.signal);
        if (controller.signal.aborted) return;
        setSummary(result);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSummary(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [year]);

  return { summary, isLoading, articleUrl };
}
