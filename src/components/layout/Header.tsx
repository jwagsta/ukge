import { useState, useEffect, useRef } from 'react';
import { useElectionStore, getYearLabel } from '@/store/electionStore';
import { useUIStore, TUTORIAL_MIN_WIDTH } from '@/store/uiStore';

import { getPartyColor } from '@/types/party';

function getWinnerLabel(name: string, short: boolean): string {
  if (name === 'Coalition') return short ? 'Coalition' : 'Coalition formed';
  return short ? name : `${name} win`;
}

function getWinnerBadgeStyle(winner: { party: string; name: string }): React.CSSProperties {
  if (winner.name === 'Coalition') {
    return { backgroundColor: getPartyColor(winner.party), color: '#FDBB30' };
  }
  return { backgroundColor: getPartyColor(winner.party), color: 'white' };
}

// Election results by year (including historical elections)
const ELECTION_WINNERS: Record<number, { party: string; name: string }> = {
  // Pre-WWII
  1918: { party: 'con', name: 'Coalition' },
  1922: { party: 'con', name: 'Conservative' },
  1923: { party: 'con', name: 'Hung' }, // Con largest party but no majority
  1924: { party: 'con', name: 'Conservative' },
  1929: { party: 'lab', name: 'Labour' }, // Minority government
  1931: { party: 'con', name: 'National' },
  1935: { party: 'con', name: 'National' },
  1945: { party: 'lab', name: 'Labour' },
  // Post-WWII
  1950: { party: 'lab', name: 'Labour' },
  1951: { party: 'con', name: 'Conservative' },
  1955: { party: 'con', name: 'Conservative' },
  1959: { party: 'con', name: 'Conservative' },
  1964: { party: 'lab', name: 'Labour' },
  1966: { party: 'lab', name: 'Labour' },
  1970: { party: 'con', name: 'Conservative' },
  // 1974 dual elections
  197402: { party: 'lab', name: 'Labour' }, // February - minority
  197410: { party: 'lab', name: 'Labour' }, // October - small majority
  1979: { party: 'con', name: 'Conservative' },
  1983: { party: 'con', name: 'Conservative' },
  1987: { party: 'con', name: 'Conservative' },
  1992: { party: 'con', name: 'Conservative' },
  1997: { party: 'lab', name: 'Labour' },
  2001: { party: 'lab', name: 'Labour' },
  2005: { party: 'lab', name: 'Labour' },
  2010: { party: 'con', name: 'Coalition' },
  2015: { party: 'con', name: 'Conservative' },
  2017: { party: 'con', name: 'Conservative' },
  2019: { party: 'con', name: 'Conservative' },
  2024: { party: 'lab', name: 'Labour' },
};

export function Header() {
  const [showInfo, setShowInfo] = useState(false);
  const [tourWidthError, setTourWidthError] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  const { currentYear, availableYears, pinnedYear, pinYear, unpinYear, setYear } = useElectionStore();
  const { isMobile } = useUIStore();
  const isComparing = pinnedYear !== null;
  const winner = ELECTION_WINNERS[currentYear];

  const handleStepBack = () => {
    const currentIndex = availableYears.indexOf(currentYear);
    const prevIndex = currentIndex <= 0 ? availableYears.length - 1 : currentIndex - 1;
    setYear(availableYears[prevIndex]);
  };

  const handleStepForward = () => {
    const currentIndex = availableYears.indexOf(currentYear);
    const nextIndex = (currentIndex + 1) % availableYears.length;
    setYear(availableYears[nextIndex]);
  };

  const stepBtnClass = `flex items-center justify-center rounded transition-colors ${
    isMobile ? 'w-9 h-9' : 'w-7 h-7'
  } bg-gray-100 hover:bg-gray-200`;
  const stepIconSize = isMobile ? 14 : 12;

  // Close on click outside
  useEffect(() => {
    if (!showInfo) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setShowInfo(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showInfo]);

  return (
    <header className={`bg-white border-b border-gray-200 relative flex items-center ${isMobile ? 'h-11 px-2' : 'h-12 px-4'}`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center gap-2 min-w-0">
        {!isMobile && (
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2 whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-6 h-6 flex-shrink-0">
              <rect x="1.5" y="1.5" width="29" height="29" rx="2" fill="#fff" stroke="#222" strokeWidth="2"/>
              <line x1="8" y1="8" x2="24" y2="24" stroke="#222" strokeWidth="4" strokeLinecap="round"/>
              <line x1="24" y1="8" x2="8" y2="24" stroke="#222" strokeWidth="4" strokeLinecap="round"/>
            </svg>
            <span className="overflow-hidden text-ellipsis">UK General Election Explorer</span>
          </h1>
        )}

        {/* Info icon with click-to-toggle panel */}
        <div className="relative" ref={infoRef}>
          <button
            onClick={() => setShowInfo(prev => !prev)}
            className={`rounded-full border flex items-center justify-center transition-colors ${
              isMobile ? 'w-7 h-7' : 'w-5 h-5'
            } ${
              showInfo
                ? 'border-blue-400 text-blue-600 bg-blue-50'
                : 'border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400'
            }`}
            aria-label="About this visualization"
          >
            <span className="text-xs font-medium">i</span>
          </button>

          {showInfo && (
            <div className={`absolute top-7 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-50 ${
              isMobile ? 'left-0 right-0 fixed mx-3 top-12' : 'left-0 w-80'
            }`}>
              <h3 className="text-sm font-medium text-gray-900 mb-2">About</h3>
              <p className="text-xs text-gray-600 mb-3">
                Explore UK General Election results from 1955 to 2024.
                Northern Ireland is included for 2024 (shown as an inset on maps;
                excluded from the ternary plot). Linked views include a ternary plot
                of constituency vote shares, geographic maps (choropleth, dot density,
                hex cartogram), national seat and vote share charts,
                per-constituency historical trends, and Wikipedia summaries
                for each election and constituency.
              </p>
              <h4 className="text-xs font-medium text-gray-700 mb-1">Data Sources</h4>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>
                  Election results:{' '}
                  <a
                    href="https://www.electoralcalculus.co.uk/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Electoral Calculus
                  </a>
                </li>
                <li>
                  Constituency boundaries:{' '}
                  <a
                    href="https://www.parlconst.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    parlconst.org
                  </a>
                </li>
                <li>
                  Coastline:{' '}
                  <a
                    href="https://geoportal.statistics.gov.uk/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    ONS Open Geography Portal
                  </a>
                </li>
                <li>
                  Contextual summaries:{' '}
                  <a
                    href="https://en.wikipedia.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Wikipedia
                  </a>
                  {' '}(CC BY-SA 3.0)
                </li>
              </ul>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => {
                    if (window.innerWidth < TUTORIAL_MIN_WIDTH) {
                      setTourWidthError(true);
                      return;
                    }
                    setTourWidthError(false);
                    setShowInfo(false);
                    // Unpin comparison mode before starting tutorial
                    const { pinnedYear: pinned, unpinYear: unpin } = useElectionStore.getState();
                    if (pinned !== null) unpin();
                    useUIStore.getState().startTutorial();
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                >
                  Take a guided tour
                </button>
                {tourWidthError && (
                  <p className="text-[10px] text-red-500 mt-1">
                    Tour requires a wider screen (at least 920px)
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Pin button, year display, election result, and year navigation */}
      <div data-tutorial="year-navigation" className="ml-auto flex items-center gap-2 flex-shrink-0">
        {/* Year display: always earlier vs later when comparing */}
        {isComparing ? (() => {
          const normalizeYear = (y: number) => y === 197402 ? 1974.2 : y === 197410 ? 1974.8 : y;
          const isSameYear = pinnedYear === currentYear;
          const pinnedIsEarlier = normalizeYear(pinnedYear!) <= normalizeYear(currentYear);
          const earlier = pinnedIsEarlier ? pinnedYear! : currentYear;
          const later = pinnedIsEarlier ? currentYear : pinnedYear!;
          const pinButton = (
            <button
              onClick={() => unpinYear()}
              className={`flex-shrink-0 flex items-center justify-center rounded transition-colors ${
                isMobile ? 'w-7 h-7' : 'w-6 h-6'
              } text-amber-600 bg-amber-50 border border-amber-300`}
              title="Unpin comparison year"
              aria-label="Unpin comparison year"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a6 6 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707s.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a6 6 0 0 1 1.013.16l3.134-3.133a3 3 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146" />
              </svg>
            </button>
          );
          const renderYear = (year: number) => {
            const isPinned = year === pinnedYear;
            const yearWinner = ELECTION_WINNERS[year];
            return (
              <span key={year} className="inline-flex items-center gap-1">
                {isPinned && pinButton}
                {isPinned ? (
                  <button
                    onClick={() => setYear(pinnedYear!)}
                    className="font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-sm hover:bg-amber-100 transition-colors"
                    title={`Go to ${getYearLabel(pinnedYear!)}`}
                  >
                    {getYearLabel(year)}
                  </button>
                ) : (
                  <span className={`font-bold text-gray-900 ${isMobile ? 'text-lg' : 'text-xl'}`}>
                    {getYearLabel(year)}
                  </span>
                )}
                {yearWinner && (
                  <span
                    className={`font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${isMobile ? 'text-[10px]' : 'text-xs'}`}
                    style={getWinnerBadgeStyle(yearWinner)}
                  >
                    {getWinnerLabel(yearWinner.name, isMobile)}
                  </span>
                )}
              </span>
            );
          };
          return (
            <div className="flex items-center gap-1.5">
              {renderYear(earlier)}
              <span className="text-gray-400 text-xs">vs</span>
              {isSameYear
                ? <span className="text-gray-400 italic text-sm">...</span>
                : renderYear(later)}
            </div>
          );
        })() : (
          <span className="inline-flex items-center gap-1.5">
            <button
              data-tutorial="pin-button"
              onClick={() => pinYear(currentYear)}
              className={`flex-shrink-0 flex items-center justify-center rounded transition-colors ${
                isMobile ? 'w-7 h-7' : 'w-6 h-6'
              } text-gray-400 hover:text-gray-600`}
              title="Pin this year for comparison"
              aria-label="Pin this year for comparison"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a6 6 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707s.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a6 6 0 0 1 1.013.16l3.134-3.133a3 3 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146m.122 2.112v-.002zm0-.002v.002a.5.5 0 0 1-.122.51L6.293 6.878a.5.5 0 0 1-.511.12H5.78l-.014-.004a5 5 0 0 0-.288-.076 5 5 0 0 0-.765-.116c-.422-.028-.836.008-1.175.15l5.51 5.509c.141-.34.177-.753.149-1.175a5 5 0 0 0-.192-1.054l-.004-.013v-.001a.5.5 0 0 1 .12-.512l3.536-3.535a.5.5 0 0 1 .532-.115l.096.022c.087.017.208.034.344.034q.172.002.343-.04L9.927 2.028q-.042.172-.04.343a1.8 1.8 0 0 0 .062.46z" />
              </svg>
            </button>
            <span className={`font-bold text-gray-900 ${isMobile ? 'text-lg' : 'text-xl'}`}>{getYearLabel(currentYear)}</span>
            {winner && (
              <span
                className={`font-medium px-2 py-0.5 rounded whitespace-nowrap ${isMobile ? 'text-xs' : 'text-sm'}`}
                style={getWinnerBadgeStyle(winner)}
              >
                {getWinnerLabel(winner.name, isMobile)}
              </span>
            )}
          </span>
        )}

        {/* Step back/forward */}
        <div className="flex items-center gap-1 flex-shrink-0" style={{ touchAction: 'manipulation' }}>
          <button
            onClick={handleStepBack}
            className={stepBtnClass}
            aria-label="Previous year"
            title="Previous"
          >
            <svg width={stepIconSize} height={stepIconSize} viewBox="0 0 14 14" fill="currentColor" className="text-gray-500">
              <path d="M10 2L4 7l6 5V2z" />
            </svg>
          </button>
          <button
            onClick={handleStepForward}
            className={stepBtnClass}
            aria-label="Next year"
            title="Next"
          >
            <svg width={stepIconSize} height={stepIconSize} viewBox="0 0 14 14" fill="currentColor" className="text-gray-500">
              <path d="M4 2l6 5-6 5V2z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
