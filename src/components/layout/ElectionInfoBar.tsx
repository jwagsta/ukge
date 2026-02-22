import { useState } from 'react';
import { useElectionWikipedia } from '@/hooks/useWikipedia';
import { WikipediaSnippet, WikipediaLinkIcons } from '@/components/panels/WikipediaSnippet';
import { electionSummaries } from '@/data/electionSummaries';
import { getYearLabel } from '@/store/electionStore';

interface ElectionInfoBarProps {
  year: number;
  isPinned?: boolean;
}

export function ElectionInfoBar({ year, isPinned }: ElectionInfoBarProps) {
  const { summary, isLoading, articleUrl } = useElectionWikipedia(year);
  const [expanded, setExpanded] = useState(false);
  const staticSummary = electionSummaries[year];

  // Don't render the bar at all if there's nothing to show
  if (!staticSummary && !isLoading && !summary?.status && !articleUrl) return null;

  const yearLabel = (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
      isPinned ? 'text-amber-700 bg-amber-50 border border-amber-200' : 'bg-white shadow-sm text-gray-700 border border-gray-200'
    }`}>
      {getYearLabel(year)}
    </span>
  );

  return (
    <div className="bg-gray-50 border-b border-gray-200 px-4 py-1.5">
      {expanded ? (
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                {yearLabel}
                <div className="flex-1 min-w-0">
                  {summary?.status === 'loaded' ? (
                    <div className="text-xs text-gray-600 leading-relaxed">
                      <p>{summary.extract}</p>
                      {articleUrl && (
                        <a
                          href={articleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-0.5 mt-1"
                        >
                          Read more on Wikipedia
                          <WikipediaLinkIcons size={10} />
                        </a>
                      )}
                    </div>
                  ) : (
                    <WikipediaSnippet summary={summary} isLoading={isLoading} articleUrl={articleUrl} variant="election" />
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="p-0.5 text-gray-400 hover:text-gray-600 shrink-0"
              aria-label="Collapse"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 8L6 4l4 4" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {yearLabel}
          <button
            onClick={() => setExpanded(true)}
            className="flex-1 min-w-0 text-left"
          >
            {staticSummary ? (
              <span className="text-xs text-gray-600 leading-relaxed">{staticSummary}</span>
            ) : (
              <WikipediaSnippet summary={summary} isLoading={isLoading} articleUrl={null} variant="election" />
            )}
          </button>
          <button
            onClick={() => setExpanded(true)}
            className="p-0.5 text-gray-400 hover:text-gray-600 shrink-0"
            aria-label="Expand"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 4l4 4 4-4" />
            </svg>
          </button>
          {articleUrl && (
            <a
              href={articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 shrink-0"
              aria-label="Wikipedia"
            >
              <WikipediaLinkIcons size={14} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
