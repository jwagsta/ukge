import { useEffect, useRef, useState, useMemo } from 'react';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { useElectionStore, getBoundaryVersion, getYearLabel, isCrossBoundarySwing } from '@/store/electionStore';
import { computeNotionalResults } from '@/utils/notionalResults';
import { computeSeatStatus, type SeatStatusInfo } from '@/utils/seatStatus';
import { useUIStore, MOBILE_BREAKPOINT } from '@/store/uiStore';
import { useContainerDimensions, useWindowSize } from '@/hooks/useWindowSize';
import { Header } from '@/components/layout/Header';
import { ElectionInfoBar } from '@/components/layout/ElectionInfoBar';
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
import { TutorialOverlay } from '@/components/tutorial/TutorialOverlay';
import { WelcomePrompt } from '@/components/tutorial/WelcomePrompt';
import { getPartyById } from '@/types/party';
import type { ElectionResult, TernaryDataPoint } from '@/types/election';

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
const WIDE_BREAKPOINT = 920;

// Cache for boundary files - limited to 3 entries to control memory
const boundaryCache = new Map<string, BoundaryData>();
const MAX_BOUNDARY_CACHE = 3;

function normalizeYearForSort(y: number): number {
  if (y === 197402) return 1974.2;
  if (y === 197410) return 1974.8;
  return y;
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mobileContentRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerDimensions(containerRef);
  const { height: measuredMobileContentHeight } = useContainerDimensions(mobileContentRef);
  const { width: windowWidth } = useWindowSize();
  const isWide = windowWidth >= WIDE_BREAKPOINT;
  const [boundaries, setBoundaries] = useState<BoundaryData>(null);
  const [boundaryVersion, setBoundaryVersion] = useState<string>('');
  const [pinnedBoundaries, setPinnedBoundaries] = useState<BoundaryData>(null);
  const [pinnedBoundaryVersionLoaded, setPinnedBoundaryVersionLoaded] = useState<string>('');

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
    pinnedYear,
    pinnedElectionData,
    pinnedTernaryData,
    pinnedBoundaryVersion,
    previousElectionData,
    transitionMapping,
    pinnedPreviousElectionData,
    pinnedTransitionMapping,
  } = useElectionStore();

  // Comparison mode derived state
  const currentBoundaryVersion = getBoundaryVersion(currentYear);
  const isComparing = pinnedYear !== null;
  const canShowSwing = previousElectionData.length > 0;
  const isCrossBoundary = isCrossBoundarySwing(currentYear);

  // Compute notional swing data for cross-boundary transitions (current year)
  const { notionalSwingData, swingEstimatedIds } = useMemo(() => {
    if (!canShowSwing || !isCrossBoundary || !transitionMapping) {
      return { notionalSwingData: previousElectionData, swingEstimatedIds: undefined };
    }
    const { notionalData, estimatedIds } = computeNotionalResults(
      electionData, previousElectionData, transitionMapping
    );
    return { notionalSwingData: notionalData, swingEstimatedIds: estimatedIds };
  }, [canShowSwing, isCrossBoundary, transitionMapping, electionData, previousElectionData]);

  // Compute notional swing data for pinned year (comparison mode)
  const pinnedCanShowSwing = pinnedPreviousElectionData.length > 0;
  const pinnedIsCrossBoundary = pinnedYear !== null && isCrossBoundarySwing(pinnedYear);
  const { pinnedNotionalSwingData, pinnedSwingEstimatedIds } = useMemo(() => {
    if (!pinnedCanShowSwing || !pinnedYear) {
      return { pinnedNotionalSwingData: pinnedPreviousElectionData, pinnedSwingEstimatedIds: undefined };
    }
    if (!pinnedIsCrossBoundary || !pinnedTransitionMapping) {
      return { pinnedNotionalSwingData: pinnedPreviousElectionData, pinnedSwingEstimatedIds: undefined };
    }
    const { notionalData, estimatedIds } = computeNotionalResults(
      pinnedElectionData, pinnedPreviousElectionData, pinnedTransitionMapping
    );
    return { pinnedNotionalSwingData: notionalData, pinnedSwingEstimatedIds: estimatedIds };
  }, [pinnedCanShowSwing, pinnedYear, pinnedIsCrossBoundary, pinnedTransitionMapping, pinnedElectionData, pinnedPreviousElectionData]);

  // Compute seat status (hold/gain) for current year
  const seatStatusMap = useMemo(() => {
    return computeSeatStatus(electionData, previousElectionData, transitionMapping, isCrossBoundary);
  }, [electionData, previousElectionData, transitionMapping, isCrossBoundary]);

  // Compute seat status for pinned year (comparison mode)
  const pinnedSeatStatusMap = useMemo(() => {
    if (!pinnedYear || pinnedElectionData.length === 0) return new Map<string, SeatStatusInfo>();
    return computeSeatStatus(pinnedElectionData, pinnedPreviousElectionData, pinnedTransitionMapping, pinnedIsCrossBoundary);
  }, [pinnedYear, pinnedElectionData, pinnedPreviousElectionData, pinnedTransitionMapping, pinnedIsCrossBoundary]);

  const { mapType, mapColorMode, votesPerDot, mobileTab, setIsMobile, isMobile, showSeatStatus } = useUIStore();

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

  // Load pinned boundaries for comparison mode
  useEffect(() => {
    if (!isComparing || !pinnedBoundaryVersion) {
      setPinnedBoundaries(null);
      setPinnedBoundaryVersionLoaded('');
      return;
    }

    // Reuse current boundaries if same era
    if (pinnedBoundaryVersion === currentBoundaryVersion) {
      setPinnedBoundaries(boundaries);
      setPinnedBoundaryVersionLoaded(pinnedBoundaryVersion);
      return;
    }

    if (pinnedBoundaryVersion === pinnedBoundaryVersionLoaded && pinnedBoundaries) {
      return;
    }

    setPinnedBoundaryVersionLoaded(pinnedBoundaryVersion);

    const cached = boundaryCache.get(pinnedBoundaryVersion);
    if (cached) {
      setPinnedBoundaries(cached);
      return;
    }

    const loadPinnedBoundary = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/boundaries/${pinnedBoundaryVersion}.json`);
        if (res.ok) {
          const data = await res.json();
          if (boundaryCache.size >= MAX_BOUNDARY_CACHE) {
            const firstKey = boundaryCache.keys().next().value;
            if (firstKey) boundaryCache.delete(firstKey);
          }
          boundaryCache.set(pinnedBoundaryVersion, data);
          setPinnedBoundaries(data);
        }
      } catch {
        console.error('Failed to load pinned boundaries for:', pinnedBoundaryVersion);
      }
    };

    loadPinnedBoundary();
  }, [isComparing, pinnedBoundaryVersion, currentBoundaryVersion, boundaries, pinnedBoundaryVersionLoaded, pinnedBoundaries]);

  // Auto-reset swing mode when it becomes unavailable (comparison mode or first-in-era year)
  useEffect(() => {
    if (!canShowSwing && mapColorMode === 'swing') {
      useUIStore.getState().setMapColorMode('winner');
    }
  }, [canShowSwing, mapColorMode]);

  // Chronological ordering for comparison mode
  const comparisonData = useMemo(() => {
    if (!isComparing || pinnedYear === null) return null;

    const pinnedNorm = normalizeYearForSort(pinnedYear);
    const currentNorm = normalizeYearForSort(currentYear);
    const earlierIsPinned = pinnedNorm <= currentNorm;

    const pinnedBounds = (pinnedBoundaryVersion === currentBoundaryVersion) ? boundaries : pinnedBoundaries;

    // Swing data: current year uses notionalSwingData, pinned uses pinnedNotionalSwingData
    const currentSwingData = mapColorMode === 'swing' && canShowSwing ? notionalSwingData : undefined;
    const currentEstIds = mapColorMode === 'swing' && canShowSwing ? swingEstimatedIds : undefined;
    const pinnedSwingData = mapColorMode === 'swing' && pinnedCanShowSwing ? pinnedNotionalSwingData : undefined;
    const pinnedEstIds = mapColorMode === 'swing' && pinnedCanShowSwing ? pinnedSwingEstimatedIds : undefined;

    // When viewing the same year as pinned, leave the later slot empty
    if (pinnedYear === currentYear) {
      return {
        earlier: {
          year: pinnedYear,
          label: getYearLabel(pinnedYear),
          isPinned: true,
          electionData: pinnedElectionData,
          ternaryData: pinnedTernaryData,
          boundaries: pinnedBounds,
          swingData: pinnedSwingData,
          swingEstimatedIds: pinnedEstIds,
          seatStatusMap: pinnedSeatStatusMap,
        },
        later: null,
      };
    }

    const earlierYear = earlierIsPinned ? pinnedYear : currentYear;
    const laterYear = earlierIsPinned ? currentYear : pinnedYear;

    return {
      earlier: {
        year: earlierYear,
        label: getYearLabel(earlierYear),
        isPinned: earlierIsPinned,
        electionData: earlierIsPinned ? pinnedElectionData : electionData,
        ternaryData: earlierIsPinned ? pinnedTernaryData : ternaryData,
        boundaries: earlierIsPinned ? pinnedBounds : boundaries,
        swingData: earlierIsPinned ? pinnedSwingData : currentSwingData,
        swingEstimatedIds: earlierIsPinned ? pinnedEstIds : currentEstIds,
        seatStatusMap: earlierIsPinned ? pinnedSeatStatusMap : seatStatusMap,
      },
      later: {
        year: laterYear,
        label: getYearLabel(laterYear),
        isPinned: !earlierIsPinned,
        electionData: earlierIsPinned ? electionData : pinnedElectionData,
        ternaryData: earlierIsPinned ? ternaryData : pinnedTernaryData,
        boundaries: earlierIsPinned ? boundaries : pinnedBounds,
        swingData: earlierIsPinned ? currentSwingData : pinnedSwingData,
        swingEstimatedIds: earlierIsPinned ? currentEstIds : pinnedEstIds,
        seatStatusMap: earlierIsPinned ? seatStatusMap : pinnedSeatStatusMap,
      },
    };
  }, [isComparing, pinnedYear, currentYear, pinnedElectionData, electionData, pinnedTernaryData, ternaryData, boundaries, pinnedBoundaries, pinnedBoundaryVersion, currentBoundaryVersion, mapColorMode, canShowSwing, pinnedCanShowSwing, notionalSwingData, swingEstimatedIds, pinnedNotionalSwingData, pinnedSwingEstimatedIds, seatStatusMap, pinnedSeatStatusMap]);

  // Render helpers for comparison panels
  const renderMapPanel = (
    panelElectionData: ElectionResult[], panelBoundaries: BoundaryData,
    panelWidth: number, panelHeight: number, label: string,
    isPinned: boolean, hideZoomControls?: boolean, hideSettingsControls?: boolean,
    panelSwingData?: ElectionResult[], panelSwingEstimatedIds?: Set<string>,
    panelSeatStatusMap?: Map<string, SeatStatusInfo>,
  ) => (
    <div className="relative" style={{ width: panelWidth, height: panelHeight }}>
      {mapType === 'choropleth' && (
        <ChoroplethMap
          electionData={panelElectionData}
          boundaries={panelBoundaries}
          width={panelWidth}
          height={panelHeight}
          selectedConstituencyId={selectedConstituencyId}
          hoveredConstituencyId={hoveredConstituencyId}
          onConstituencySelect={setSelectedConstituency}
          onConstituencyHover={setHoveredConstituency}
          hideZoomControls={hideZoomControls}
          pinnedElectionData={panelSwingData}
          swingEstimatedIds={panelSwingEstimatedIds}
          seatStatusMap={panelSeatStatusMap}
        />
      )}
      {mapType === 'dots' && (
        <DotDensityMap
          electionData={panelElectionData}
          boundaries={panelBoundaries}
          width={panelWidth}
          height={panelHeight}
          votesPerDot={votesPerDot}
          selectedConstituencyId={selectedConstituencyId}
          hoveredConstituencyId={hoveredConstituencyId}
          onConstituencySelect={setSelectedConstituency}
          onConstituencyHover={setHoveredConstituency}
          hideZoomControls={hideZoomControls}
          hideSettingsControls={hideSettingsControls}
        />
      )}
      {mapType === 'hex' && (
        <HexMap
          electionData={panelElectionData}
          boundaries={panelBoundaries}
          width={panelWidth}
          height={panelHeight}
          selectedConstituencyId={selectedConstituencyId}
          hoveredConstituencyId={hoveredConstituencyId}
          onConstituencySelect={setSelectedConstituency}
          onConstituencyHover={setHoveredConstituency}
          hideZoomControls={hideZoomControls}
          pinnedElectionData={panelSwingData}
          swingEstimatedIds={panelSwingEstimatedIds}
          seatStatusMap={panelSeatStatusMap}
        />
      )}
      <div className={`absolute top-2 right-2 z-10 text-xs font-semibold px-2 py-1 rounded ${
        isPinned ? 'text-amber-700 bg-amber-50 border border-amber-200' : 'bg-white/90 shadow'
      }`}>
        {label}
      </div>
    </div>
  );

  const renderTernaryPanel = (panelTernaryData: TernaryDataPoint[], panelWidth: number, panelHeight: number, label: string, isPinned: boolean, year?: number) => (
    <div className="relative" style={{ width: panelWidth, height: panelHeight }}>
      <TernaryPlot
        data={panelTernaryData}
        width={panelWidth}
        height={panelHeight}
        selectedConstituencyId={selectedConstituencyId}
        hoveredConstituencyId={hoveredConstituencyId}
        onConstituencySelect={setSelectedConstituency}
        onConstituencyHover={setHoveredConstituency}
        displayYear={year}
      />
      <div className={`absolute top-2 right-2 z-10 text-xs font-semibold px-2 py-1 rounded ${
        isPinned ? 'text-amber-700 bg-amber-50 border border-amber-200' : 'bg-white/90 shadow'
      }`}>
        {label}
      </div>
    </div>
  );

  const renderEmptySlot = (slotWidth: number, slotHeight: number) => (
    <div className="flex items-center justify-center bg-gray-50" style={{ width: slotWidth, height: slotHeight }}>
      <span className="text-sm text-gray-400 text-center px-4">Navigate to another year to compare</span>
    </div>
  );

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
    <div data-tutorial="map-controls" className="absolute top-2 left-2 z-10 flex flex-col gap-1" style={{ touchAction: 'manipulation' }}>
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
          {canShowSwing && <option value="swing">Con/Lab Swing</option>}
          {topParties.map((p) => (
            <option key={p.id} value={p.id}>{p.shortName}</option>
          ))}
        </select>
      )}
      {mapColorMode === 'winner' && (mapType === 'choropleth' || mapType === 'hex') && (
        <>
          <label
            className={`flex items-center gap-1.5 bg-white border border-gray-300 rounded shadow-sm cursor-pointer ${
              isMobile ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs'
            }`}
            style={isMobile ? { minHeight: 44 } : undefined}
          >
            <input
              type="checkbox"
              checked={showSeatStatus}
              onChange={(e) => useUIStore.getState().setShowSeatStatus(e.target.checked)}
              className="accent-blue-600"
            />
            Highlight gains
          </label>
          {showSeatStatus && (
            <div className="bg-white border border-gray-300 rounded shadow-sm px-2 py-1.5">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <rect width="12" height="12" fill="#888" rx="1" />
                  </svg>
                  <span>Gain</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <rect width="12" height="12" fill="#888" opacity="0.35" rx="1" />
                  </svg>
                  <span>Hold</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <defs>
                      <pattern id="legend-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="12" height="12" fill="#888" opacity="0.55" rx="1" />
                    <rect width="12" height="12" fill="url(#legend-hatch)" rx="1" />
                  </svg>
                  <span>New seat</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {mapColorMode === 'swing' && (mapType === 'choropleth' || mapType === 'hex') && (
        <div className="bg-white border border-gray-300 rounded shadow-sm px-2 py-1.5">
          <div className="flex items-center gap-1 text-[10px] text-gray-600">
            <span className="shrink-0" style={{ color: '#DC241f', width: 18, textAlign: 'right' }}>Lab</span>
            <div
              className="rounded-sm flex-1"
              style={{
                height: 10,
                background: 'linear-gradient(to right, #DC241f, #f5f5f5, #0063A6)',
              }}
            />
            <span className="shrink-0" style={{ color: '#0063A6', width: 18 }}>Con</span>
          </div>
          <div className="flex text-[9px] text-gray-400 mt-0.5" style={{ paddingLeft: 18 + 4, paddingRight: 18 + 4 }}>
            <span className="flex-1 text-left">-20</span>
            <span className="flex-none text-center">0</span>
            <span className="flex-1 text-right">+20</span>
          </div>
          {((swingEstimatedIds && swingEstimatedIds.size > 0) || (pinnedSwingEstimatedIds && pinnedSwingEstimatedIds.size > 0)) && (
            <div className="mt-1 pt-1 border-t border-gray-200">
              <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect width="12" height="12" fill="#e5e5e5" rx="1" />
                  <line x1="0" y1="12" x2="12" y2="0" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
                  <line x1="0" y1="8" x2="8" y2="0" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
                  <line x1="4" y1="12" x2="12" y2="4" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
                </svg>
                <span>Estimated</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Shared map content JSX (single map, non-comparing mode)
  const swingData = mapColorMode === 'swing' ? notionalSwingData : undefined;
  const swingEstIds = mapColorMode === 'swing' ? swingEstimatedIds : undefined;
  const mapContent = (
    <div data-tutorial="geographic-map" className="relative" style={{ width: mapWidth, height: mapHeight }}>
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
          pinnedElectionData={swingData}
          swingEstimatedIds={swingEstIds}
          seatStatusMap={seatStatusMap}
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
          pinnedElectionData={swingData}
          swingEstimatedIds={swingEstIds}
          seatStatusMap={seatStatusMap}
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
      {isComparing && comparisonData ? (
        comparisonData.later ? (
          <div className="flex border-b border-gray-200">
            <div className="w-1/2 min-w-0 border-r border-gray-200">
              <ElectionInfoBar year={comparisonData.earlier.year} isPinned={comparisonData.earlier.isPinned} noBorder />
            </div>
            <div className="w-1/2 min-w-0">
              <ElectionInfoBar year={comparisonData.later.year} isPinned={comparisonData.later.isPinned} noBorder />
            </div>
          </div>
        ) : (
          <div className="flex border-b border-gray-200">
            <div className="w-1/2 min-w-0 border-r border-gray-200">
              <ElectionInfoBar year={currentYear} isPinned noBorder />
            </div>
            <div className="w-1/2 min-w-0 bg-amber-50 flex items-center px-4 py-1.5">
              <span className="text-xs text-amber-600">Select another year to compare</span>
            </div>
          </div>
        )
      ) : (
        <div data-tutorial="election-info-bar">
          <ElectionInfoBar year={currentYear} />
        </div>
      )}

      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
        {loadingOverlay}
        {errorOverlay}

        {!error && width > 0 && height > 0 && (
          isMobile ? (
            <>
              {/* Mobile layout: single view based on active tab */}
              <div ref={mobileContentRef} className="flex-1 overflow-hidden">
                {mobileTab === 'map' && (
                  isComparing && comparisonData ? (
                    <div className="relative" style={{ width, height: mobileContentHeight }}>
                      <div className="flex">
                        {renderMapPanel(comparisonData.earlier.electionData, comparisonData.earlier.boundaries, Math.floor(width / 2), mobileContentHeight, comparisonData.earlier.label, comparisonData.earlier.isPinned, true, undefined, comparisonData.earlier.swingData, comparisonData.earlier.swingEstimatedIds, comparisonData.earlier.seatStatusMap)}
                        <div className="border-l border-gray-300" />
                        {comparisonData.later
                          ? renderMapPanel(comparisonData.later.electionData, comparisonData.later.boundaries, Math.floor(width / 2), mobileContentHeight, comparisonData.later.label, comparisonData.later.isPinned, false, true, comparisonData.later.swingData, comparisonData.later.swingEstimatedIds, comparisonData.later.seatStatusMap)
                          : renderEmptySlot(Math.floor(width / 2), mobileContentHeight)}
                      </div>
                      {mapToggleOverlay}
                    </div>
                  ) : mapContent
                )}
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
                  isComparing && comparisonData ? (
                    <div className="flex flex-col" style={{ height: mobileContentHeight }}>
                      {renderTernaryPanel(comparisonData.earlier.ternaryData, width, Math.floor(mobileContentHeight / 2), comparisonData.earlier.label, comparisonData.earlier.isPinned, comparisonData.earlier.year)}
                      <div className="border-t border-gray-300" />
                      {comparisonData.later
                        ? renderTernaryPanel(comparisonData.later.ternaryData, width, Math.floor(mobileContentHeight / 2), comparisonData.later.label, comparisonData.later.isPinned, comparisonData.later.year)
                        : renderEmptySlot(width, Math.floor(mobileContentHeight / 2))}
                    </div>
                  ) : (
                    <TernaryPlot
                      data={ternaryData}
                      width={ternaryWidth}
                      height={ternaryHeight}
                      selectedConstituencyId={selectedConstituencyId}
                      hoveredConstituencyId={hoveredConstituencyId}
                      onConstituencySelect={setSelectedConstituency}
                      onConstituencyHover={setHoveredConstituency}
                    />
                  )
                )}
              </div>
              <MobileTabBar />
              <MobileBottomSheet seatStatusMap={seatStatusMap} />
            </>
          ) : isWide ? (
            <>
              {/* Wide layout: left column (charts + ternary) | right column (map) */}
              <div className="flex flex-1" style={{ height: contentHeight - BOTTOM_PANEL_HEIGHT }}>
                {/* Left column: charts stacked above ternary */}
                <div className="border-r border-gray-200 flex flex-col" style={{ width: leftWidth }}>
                  <div data-tutorial="national-charts">
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
                  </div>
                  {isComparing && comparisonData ? (
                    <div className="flex" style={{ height: ternaryHeight }}>
                      {renderTernaryPanel(comparisonData.earlier.ternaryData, Math.floor(leftWidth / 2), ternaryHeight, comparisonData.earlier.label, comparisonData.earlier.isPinned, comparisonData.earlier.year)}
                      <div className="border-l border-gray-300" />
                      {comparisonData.later
                        ? renderTernaryPanel(comparisonData.later.ternaryData, Math.floor(leftWidth / 2), ternaryHeight, comparisonData.later.label, comparisonData.later.isPinned, comparisonData.later.year)
                        : renderEmptySlot(Math.floor(leftWidth / 2), ternaryHeight)}
                    </div>
                  ) : (
                    <div data-tutorial="ternary-plot" style={{ width: leftWidth, height: ternaryHeight }}>
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
                  )}
                </div>

                {/* Right column: map full height */}
                {isComparing && comparisonData ? (
                  <div className="relative flex" style={{ width: rightWidth, height: mapHeight }}>
                    {renderMapPanel(comparisonData.earlier.electionData, comparisonData.earlier.boundaries, Math.floor(rightWidth / 2), mapHeight, comparisonData.earlier.label, comparisonData.earlier.isPinned, true, undefined, comparisonData.earlier.swingData, comparisonData.earlier.swingEstimatedIds, comparisonData.earlier.seatStatusMap)}
                    <div className="border-l border-gray-300" />
                    {comparisonData.later
                      ? renderMapPanel(comparisonData.later.electionData, comparisonData.later.boundaries, Math.floor(rightWidth / 2), mapHeight, comparisonData.later.label, comparisonData.later.isPinned, false, true, comparisonData.later.swingData, comparisonData.later.swingEstimatedIds, comparisonData.later.seatStatusMap)
                      : renderEmptySlot(Math.floor(rightWidth / 2), mapHeight)}
                    {mapToggleOverlay}
                  </div>
                ) : mapContent}
              </div>

              <ConstituencyPanel height={BOTTOM_PANEL_HEIGHT} seatStatusMap={seatStatusMap} />
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
                {isComparing && comparisonData ? (
                  <>
                    <div className="border-r border-gray-200 flex" style={{ width: ternaryWidth }}>
                      {renderTernaryPanel(comparisonData.earlier.ternaryData, Math.floor(ternaryWidth / 2), ternaryHeight, comparisonData.earlier.label, comparisonData.earlier.isPinned, comparisonData.earlier.year)}
                      <div className="border-l border-gray-300" />
                      {comparisonData.later
                        ? renderTernaryPanel(comparisonData.later.ternaryData, Math.floor(ternaryWidth / 2), ternaryHeight, comparisonData.later.label, comparisonData.later.isPinned, comparisonData.later.year)
                        : renderEmptySlot(Math.floor(ternaryWidth / 2), ternaryHeight)}
                    </div>
                    <div className="relative flex" style={{ width: mapWidth }}>
                      {renderMapPanel(comparisonData.earlier.electionData, comparisonData.earlier.boundaries, Math.floor(mapWidth / 2), mapHeight, comparisonData.earlier.label, comparisonData.earlier.isPinned, true, undefined, comparisonData.earlier.swingData, comparisonData.earlier.swingEstimatedIds, comparisonData.earlier.seatStatusMap)}
                      <div className="border-l border-gray-300" />
                      {comparisonData.later
                        ? renderMapPanel(comparisonData.later.electionData, comparisonData.later.boundaries, Math.floor(mapWidth / 2), mapHeight, comparisonData.later.label, comparisonData.later.isPinned, false, true, comparisonData.later.swingData, comparisonData.later.swingEstimatedIds, comparisonData.later.seatStatusMap)
                        : renderEmptySlot(Math.floor(mapWidth / 2), mapHeight)}
                      {mapToggleOverlay}
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>

              <ConstituencyPanel height={BOTTOM_PANEL_HEIGHT} seatStatusMap={seatStatusMap} />
            </>
          )
        )}

        {emptyState}
      </div>
      <TutorialOverlay />
      <WelcomePrompt />
    </div>
  );
}

export default App;
