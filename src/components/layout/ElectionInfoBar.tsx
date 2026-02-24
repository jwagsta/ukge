import { useState } from 'react';
import { useElectionWikipediaUrl } from '@/hooks/useWikipedia';
import { WikipediaLinkIcons } from '@/components/panels/WikipediaSnippet';
import { electionSummaries } from '@/data/electionSummaries';
import { getYearLabel } from '@/store/electionStore';

interface ElectionInfoBarProps {
  year: number;
  isPinned?: boolean;
  noBorder?: boolean;
}

export function ElectionInfoBar({ year, isPinned, noBorder }: ElectionInfoBarProps) {
  const articleUrl = useElectionWikipediaUrl(year);
  const [expanded, setExpanded] = useState(false);
  const summary = electionSummaries[year];

  if (!summary) return null;

  const yearLabel = (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
      isPinned ? 'text-amber-700 bg-amber-50 border border-amber-200' : 'bg-white shadow-sm text-gray-700 border border-gray-200'
    }`}>
      {getYearLabel(year)}
    </span>
  );

  return (
    <div className={`bg-gray-50 px-4 py-1.5 relative${noBorder ? '' : ' border-b border-gray-200'}`}>
      {/* Headline row — always one line, truncated */}
      <div className="flex items-center gap-2">
        {yearLabel}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 min-w-0 text-left truncate"
        >
          <span className="text-xs text-gray-600 truncate block">{summary.headline}</span>
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 text-gray-400 hover:text-gray-600 shrink-0"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={expanded ? 'M2 8L6 4l4 4' : 'M2 4l4 4 4-4'} />
          </svg>
        </button>
      </div>
      {/* Expanded detail — overlays content below */}
      {expanded && (
        <div className="absolute left-0 right-0 top-full z-30 bg-gray-50 px-4 pb-2 shadow-md border-b border-gray-200">
          <p className="text-xs text-gray-600 leading-relaxed">
            {summary.detail}
          </p>
          {articleUrl && (
            <a
              href={articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center gap-0.5 mt-1 text-xs"
            >
              Read more on Wikipedia
              <WikipediaLinkIcons size={10} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
