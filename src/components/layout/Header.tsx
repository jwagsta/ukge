import { useState, useEffect, useRef } from 'react';
import { useElectionStore, getYearLabel } from '@/store/electionStore';
import { PlayButton } from '@/components/controls/PlayButton';
import { getPartyColor } from '@/types/party';

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
  const infoRef = useRef<HTMLDivElement>(null);
  const { currentYear } = useElectionStore();
  const winner = ELECTION_WINNERS[currentYear];

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
    <header className="h-12 bg-white border-b border-gray-200 relative flex items-center px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-900">
          UK General Election Results
        </h1>

        {/* Info icon with click-to-toggle panel */}
        <div className="relative" ref={infoRef}>
          <button
            onClick={() => setShowInfo(prev => !prev)}
            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
              showInfo
                ? 'border-blue-400 text-blue-600 bg-blue-50'
                : 'border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400'
            }`}
            aria-label="About this visualization"
          >
            <span className="text-xs font-medium">i</span>
          </button>

          {showInfo && (
            <div className="absolute left-0 top-7 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-50">
              <h3 className="text-sm font-medium text-gray-900 mb-2">About</h3>
              <p className="text-xs text-gray-600 mb-3">
                Explore Great Britain General Election results from 1955 to 2024
                (Northern Ireland excluded). Linked views include a ternary plot
                of constituency vote shares, geographic maps (choropleth, dot density,
                hex cartogram, small multiples), national seat and vote share charts,
                and per-constituency historical trends.
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
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Center: Playback controls (absolutely centered) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <PlayButton intervalMs={1500} />
      </div>

      {/* Right: Year and election result */}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xl font-bold text-gray-900">{getYearLabel(currentYear)}</span>
        {winner && (
          <span
            className="text-sm font-medium px-2 py-0.5 rounded"
            style={{
              backgroundColor: getPartyColor(winner.party),
              color: 'white',
            }}
          >
            {winner.name} win
          </span>
        )}
      </div>
    </header>
  );
}
