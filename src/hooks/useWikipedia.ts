import { useState, useEffect } from 'react';
import {
  getConstituencyArticleTitle,
  getElectionArticleTitle,
  getArticleUrl,
} from '@/services/wikipedia';

export function useConstituencyWikipediaUrl(constituencyId: string | null): string | null {
  const [articleUrl, setArticleUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!constituencyId) {
      setArticleUrl(null);
      return;
    }

    let cancelled = false;
    getConstituencyArticleTitle(constituencyId).then((title) => {
      if (cancelled || !title) {
        if (!cancelled) setArticleUrl(null);
        return;
      }
      setArticleUrl(getArticleUrl(title));
    });

    return () => { cancelled = true; };
  }, [constituencyId]);

  return articleUrl;
}

export function useElectionWikipediaUrl(year: number): string {
  return getArticleUrl(getElectionArticleTitle(year));
}
