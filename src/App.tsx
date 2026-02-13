import { useEffect, useRef, useState, useMemo } from 'react';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { useElectionStore, getBoundaryVersion } from '@/store/electionStore';
import { useUIStore, MOBILE_BREAKPOINT } from '@/store/uiStore';
import { useContainerDimensions, useWindowSize } from '@/hooks/useWindowSize';
import { Header } from '@/components/layout/Header';
import { MobileTabBar } from '@/components/layout/MobileTabBar';
import { TernaryPlot } from '@/components/charts/TernaryPlot/TernaryPlot';
import { DotDensityMap } from '@/components/charts/DotDensityMap/DotDensityMap';
import { ChoroplethMap } from '@/components/charts/ChoroplethMap/ChoroplethMap';
import { HexMap } from '@/components/charts/HexMap/HexMap';
import { SeatsChart } from '@/components/charts/SeatsChart/SeatsChart';
import { SeatsBarChart } from '@/components/charts/SeatsBarChart/SeatsBarChart';
import { VoteShareChart } from '@/components/charts/VoteShareChart/VoteShareChart';
import { VoteShareBarChart } from '@/components/charts/VoteShareBarChart/VoteShareBarChart';
import { ConstituencyPanel } from '@/components/panels/ConstituencyPanel';
import { MobileBottomSheet } from '@/components/panels/MobileBottomSheet';
import { getPartyById } from '@/types/party';

interface ConstituencyProperties {
  PCON13CD?: string;
  PCON13NM?: string;
  PCON24CD?: string;
  PCON24NM?: string;
  id?: string;
  name?: string;
  [key: string]: unknown;
}

type BoundaryData = FeatureCollection<Polygon | MultiPolygon, ConstituencyProperties> | null;

const CHART_ROW_HEIGHT = 100;
const BOTTOM_PANEL_HEIGHT = 200;
const WIDE_BREAKPOINT = 1000;

// Cache for boundary files - limited to 2 entries to control memory
const boundaryCache = new Map<string, BoundaryData>();
const MAX_BOUNDARY_CACHE = 2;

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mobileContentRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerDimensions(containerRef);
  const { height: measuredMobileContentHeight } = useContainerDimensions(mobileContentRef);
  const { width: windowWidth } = useWindowSize();
  const isWide = windowWidth >= WIDE_BREAKPOINT;
  const [boundaries, setBoundaries] = useState<BoundaryData>(null);
  const [boundaryVersion, setBoundaryVersion] = useState<string>('');

  const {
    currentYear,
    electionData,
    ternaryData,
    isLoading,
    error,
    loadElectionData,
    selectedConstituencyId,
    hoveredConstituencyId,
    setSelectedConstituency,
    setHoveredConstituency,
  } = useElectionStore();

  const { mapType, mapColorMode, votesPerDot, mobileTab, setIsMobile, isMobile } = useUIStore();

  // Track mobile state
  useEffect(() => {
    setIsMobile(windowWidth < MOBILE_BREAKPOINT);
  }, [windowWidth, setIsMobile]);

  // Compute top parties for the current election (for the party color mode dropdown)
  const topParties = useMemo(() => {
    if (!electionData.length) return [];
    const partyVotes = new Map<string, number>();
    for (const result of electionData) {
      for (const pr of result.results) {
        const pid = pr.partyId.toLowerCase();
        partyVotes.set(pid, (partyVotes.get(pid) || 0) + pr.votes);
      }
    }
    return Array.from(partyVotes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([partyId]) => {
        const party = getPartyById(partyId);
        return { id: party.id, shortName: party.shortName };
      });
  }, [electionData]);

  // Load election data on mount and year change
  useEffect(() => {
    loadElectionData(currentYear);
  }, [currentYear, loadElectionData]);

  // Load boundaries based on election year
  useEffect(() => {
    const newBoundaryVersion = getBoundaryVersion(currentYear);

    // Check if we need to load a new boundary file
    if (newBoundaryVersion === boundaryVersion && boundaries) {
      return;
    }

    setBoundaryVersion(newBoundaryVersion);

    // Check cache first
    const cached = boundaryCache.get(newBoundaryVersion);
    if (cached) {
      setBoundaries(cached);
      return;
    }

    // Try to load era-specific boundary file first, then fall back to default
    const boundaryFiles = [
      `${import.meta.env.BASE_URL}data/boundaries/${newBoundaryVersion}.json`,
      `${import.meta.env.BASE_URL}data/boundaries/constituencies.json`, // Fallback
    ];

    const tryLoadBoundary = async () => {
      for (const file of boundaryFiles) {
        try {
          const res = await fetch(file);
          if (res.ok) {
            const data = await res.json();
            // Limit cache size to control memory
            if (boundaryCache.size >= MAX_BOUNDARY_CACHE) {
              const firstKey = boundaryCache.keys().next().value;
              if (firstKey) boundaryCache.delete(firstKey);
            }
            boundaryCache.set(newBoundaryVersion, data);
            setBoundaries(data);
            return;
          }
        } catch {
          // Try next file
        }
      }
      console.error('Failed to load boundaries for:', newBoundaryVersion);
    };

    tryLoadBoundary();
  }, [currentYear, boundaryVersion, boundaries]);

  // Calculate layout dimensions based on wide/narrow/mobile mode
  const MOBILE_TAB_HEIGHT = 52;
  const contentHeight = height;
  const leftWidth = isWide ? Math.floor(width / 2) : width;
  const rightWidth = isWide ? width - leftWidth : width;
  const barChartWidth = isWide ? Math.min(200, Math.floor(leftWidth * 0.3)) : 200;

  // Mobile: full viewport for each tab (minus tab bar)
  // Wide: ternary fills remaining height in left column; map gets full content height
  // Narrow: ternary and map split width, sharing height below chart rows
  const mobileContentHeight = isMobile && measuredMobileContentHeight > 0
    ? measuredMobileContentHeight
    : contentHeight - MOBILE_TAB_HEIGHT;
  const ternaryHeight = isMobile
    ? mobileContentHeight
    : isWide
      ? contentHeight - 2 * CHART_ROW_HEIGHT - BOTTOM_PANEL_HEIGHT
      : contentHeight - 2 * CHART_ROW_HEIGHT - BOTTOM_PANEL_HEIGHT;
  const ternaryWidth = isMobile ? width : isWide ? leftWidth : Math.floor(width / 2);
  const mapWidth = isMobile ? width : isWide ? rightWidth : width - ternaryWidth;
  const mapHeight = isMobile
    ? mobileContentHeight
    : isWide
      ? contentHeight - BOTTOM_PANEL_HEIGHT
      : contentHeight - 2 * CHART_ROW_HEIGHT - BOTTOM_PANEL_HEIGHT;

  // Shared map overlay JSX
  const mapToggleOverlay = (
    <div className="absolute top-2 left-2 z-10 flex flex-col gap-1" style={{ touchAction: 'manipulation' }}>
      <div className="flex rounded-md border border-gray-300 overflow-hidden shadow-sm bg-white">
        {(['choropleth', 'hex', 'dots'] as const).map((type) => (
          <button
            key={type}
            onClick={() => useUIStore.getState().setMapType(type)}
            className={`transition-colors ${
              isMobile ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs'
            } ${
              mapType === type
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
            style={isMobile ? { minHeight: 44 } : undefined}
          >
            {type === 'choropleth' ? 'Map' : type === 'hex' ? 'Hex' : 'Dots'}
          </button>
        ))}
      </div>
      {(mapType === 'choropleth' || mapType === 'hex') && (
        <select
          value={mapColorMode}
          onChange={(e) => useUIStore.getState().setMapColorMode(e.target.value)}
          className={`bg-white border border-gray-300 rounded shadow-sm ${
            isMobile ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs'
          }`}
          style={isMobile ? { minHeight: 44 } : undefined}
        >
          <option value="winner">Winner</option>
          {topParties.map((p) => (
            <option key={p.id} value={p.id}>{p.shortName}</option>
          ))}
        </select>
      )}
    </div>
  );

  // Shared map content JSX
  const mapContent = (
    <div className="relative" style={{ width: mapWidth, height: mapHeight }}>
      {mapType === 'choropleth' && (
        <ChoroplethMap
          electionData={electionData}
          boundaries={boundaries}
          width={mapWidth}
          height={mapHeight}
          selectedConstituencyId={selectedConstituencyId}
          hoveredConstituencyId={hoveredConstituencyId}
          onConstituencySelect={setSelectedConstituency}
          onConstituencyHover={setHoveredConstituency}
        />
      )}
      {mapType === 'dots' && (
        <DotDensityMap
          electionData={electionData}
          boundaries={boundaries}
          width={mapWidth}
          height={mapHeight}
          votesPerDot={votesPerDot}
          selectedConstituencyId={selectedConstituencyId}
          hoveredConstituencyId={hoveredConstituencyId}
          onConstituencySelect={setSelectedConstituency}
          onConstituencyHover={setHoveredConstituency}
        />
      )}
      {mapType === 'hex' && (
        <HexMap
          electionData={electionData}
          boundaries={boundaries}
          width={mapWidth}
          height={mapHeight}
          selectedConstituencyId={selectedConstituencyId}
          hoveredConstituencyId={hoveredConstituencyId}
          onConstituencySelect={setSelectedConstituency}
          onConstituencyHover={setHoveredConstituency}
        />
      )}
      {mapToggleOverlay}
    </div>
  );

  // Loading/error overlays
  const loadingOverlay = isLoading && (
    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
      <div className="flex items-center gap-3 bg-white rounded-lg shadow-lg px-6 py-4">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-700">Loading {currentYear} election data...</span>
      </div>
    </div>
  );

  const errorOverlay = error && (
    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
      <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-4 max-w-md">
        <h3 className="text-red-800 font-semibold mb-1">Error loading data</h3>
        <p className="text-red-600 text-sm">{error}</p>
        <p className="text-gray-500 text-xs mt-2">
          Make sure the election data files are in public/data/elections/
        </p>
      </div>
    </div>
  );

  const emptyState = !isLoading && !error && electionData.length === 0 && (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          No Data Available
        </h2>
        <p className="text-gray-600 mb-4">
          Election data for {currentYear} hasn't been loaded yet.
        </p>
        <p className="text-sm text-gray-500">
          Place election data JSON files in{' '}
          <code className="bg-gray-100 px-1 rounded">public/data/elections/</code>
        </p>
      </div>
    </div>
  );

  // Mobile chart heights: line charts get remaining space after bar charts
  const MOBILE_BAR_CHART_HEIGHT = 80;
  const mobileLineChartHeight = Math.floor((mobileContentHeight - MOBILE_BAR_CHART_HEIGHT * 2) / 2);

  return (
    <div className="h-dvh flex flex-col bg-gray-50">
      <Header />

      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
        {loadingOverlay}
        {errorOverlay}

        {!error && width > 0 && height > 0 && (
          isMobile ? (
            <>
              {/* Mobile layout: single view based on active tab */}
              <div ref={mobileContentRef} className="flex-1 overflow-hidden">
                {mobileTab === 'map' && mapContent}
                {mobileTab === 'charts' && (
                  <div className="flex flex-col" style={{ height: mobileContentHeight }}>
                    <SeatsChart height={mobileLineChartHeight} />
                    <VoteShareChart height={mobileLineChartHeight} />
                    <div className="flex border-t border-gray-200">
                      <SeatsBarChart height={MOBILE_BAR_CHART_HEIGHT * 2} width={Math.floor(width / 2)} />
                      <VoteShareBarChart height={MOBILE_BAR_CHART_HEIGHT * 2} width={Math.floor(width / 2)} />
                    </div>
                  </div>
                )}
                {mobileTab === 'ternary' && (
                  <TernaryPlot
                    data={ternaryData}
                    width={ternaryWidth}
                    height={ternaryHeight}
                    selectedConstituencyId={selectedConstituencyId}
                    hoveredConstituencyId={hoveredConstituencyId}
                    onConstituencySelect={setSelectedConstituency}
                    onConstituencyHover={setHoveredConstituency}
                  />
                )}
              </div>
              <MobileTabBar />
              <MobileBottomSheet />
            </>
          ) : isWide ? (
            <>
              {/* Wide layout: left column (charts + ternary) | right column (map) */}
              <div className="flex flex-1" style={{ height: contentHeight - BOTTOM_PANEL_HEIGHT }}>
                {/* Left column: charts stacked above ternary */}
                <div className="border-r border-gray-200 flex flex-col" style={{ width: leftWidth }}>
                  <div className="flex">
                    <div className="flex-1 min-w-0">
                      <SeatsChart height={CHART_ROW_HEIGHT} />
                    </div>
                    <SeatsBarChart height={CHART_ROW_HEIGHT} width={barChartWidth} />
                  </div>
                  <div className="flex">
                    <div className="flex-1 min-w-0">
                      <VoteShareChart height={CHART_ROW_HEIGHT} />
                    </div>
                    <VoteShareBarChart height={CHART_ROW_HEIGHT} width={barChartWidth} />
                  </div>
                  <div style={{ width: leftWidth, height: ternaryHeight }}>
                    <TernaryPlot
                      data={ternaryData}
                      width={leftWidth}
                      height={ternaryHeight}
                      selectedConstituencyId={selectedConstituencyId}
                      hoveredConstituencyId={hoveredConstituencyId}
                      onConstituencySelect={setSelectedConstituency}
                      onConstituencyHover={setHoveredConstituency}
                    />
                  </div>
                </div>

                {/* Right column: map full height */}
                {mapContent}
              </div>

              <ConstituencyPanel height={BOTTOM_PANEL_HEIGHT} />
            </>
          ) : (
            <>
              {/* Narrow layout: charts on top, then ternary + map side by side */}
              <div className="flex">
                <div className="flex-1 min-w-0">
                  <SeatsChart height={CHART_ROW_HEIGHT} />
                </div>
                <SeatsBarChart height={CHART_ROW_HEIGHT} width={barChartWidth} />
              </div>
              <div className="flex">
                <div className="flex-1 min-w-0">
                  <VoteShareChart height={CHART_ROW_HEIGHT} />
                </div>
                <VoteShareBarChart height={CHART_ROW_HEIGHT} width={barChartWidth} />
              </div>

              <div className="flex flex-1" style={{ height: mapHeight }}>
                <div className="border-r border-gray-200" style={{ width: ternaryWidth, height: ternaryHeight }}>
                  <TernaryPlot
                    data={ternaryData}
                    width={ternaryWidth}
                    height={ternaryHeight}
                    selectedConstituencyId={selectedConstituencyId}
                    hoveredConstituencyId={hoveredConstituencyId}
                    onConstituencySelect={setSelectedConstituency}
                    onConstituencyHover={setHoveredConstituency}
                  />
                </div>
                {mapContent}
              </div>

              <ConstituencyPanel height={BOTTOM_PANEL_HEIGHT} />
            </>
          )
        )}

        {emptyState}
      </div>
    </div>
  );
}

export default App;
