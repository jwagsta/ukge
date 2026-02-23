import { create } from 'zustand';

export type MapType = 'choropleth' | 'dots' | 'hex';
export type MobileTab = 'map' | 'charts' | 'ternary';

export interface ZoomTransform {
  k: number; // scale
  x: number; // translate x
  y: number; // translate y
}

export const MOBILE_BREAKPOINT = 640;

interface UIState {
  mapType: MapType;
  mapColorMode: string;
  votesPerDot: number;
  isMobile: boolean;
  mobileTab: MobileTab;
  ternaryZoom: ZoomTransform;
  mapZoom: ZoomTransform;
  hoveredChartYear: number | null;
  dotPartyFilter: Set<string>;

  setMapType: (type: MapType) => void;
  setMapColorMode: (mode: string) => void;
  setVotesPerDot: (value: number) => void;
  toggleDotParty: (partyId: string) => void;
  setIsMobile: (value: boolean) => void;
  setMobileTab: (tab: MobileTab) => void;
  setTernaryZoom: (transform: ZoomTransform) => void;
  resetTernaryZoom: () => void;
  setMapZoom: (transform: ZoomTransform) => void;
  resetMapZoom: () => void;
  setHoveredChartYear: (year: number | null) => void;
}

const DEFAULT_ZOOM: ZoomTransform = { k: 1, x: 0, y: 0 };

export const useUIStore = create<UIState>((set) => ({
  mapType: 'choropleth',
  mapColorMode: 'winner',
  votesPerDot: 10000,
  isMobile: false,
  mobileTab: 'map',
  ternaryZoom: DEFAULT_ZOOM,
  mapZoom: DEFAULT_ZOOM,
  hoveredChartYear: null,
  dotPartyFilter: new Set<string>(),

  setMapType: (type) => set((state) => ({
    mapType: type,
    mapColorMode: type === 'dots' ? 'winner' : state.mapColorMode,
  })),
  setMapColorMode: (mode) => set({ mapColorMode: mode }),
  setVotesPerDot: (value) => set({ votesPerDot: value }),
  toggleDotParty: (partyId) => set((state) => {
    const next = new Set(state.dotPartyFilter);
    if (next.has(partyId)) {
      next.delete(partyId);
    } else {
      next.add(partyId);
    }
    return { dotPartyFilter: next };
  }),
  setIsMobile: (value) => set({ isMobile: value }),
  setMobileTab: (tab) => set({ mobileTab: tab }),
  setTernaryZoom: (transform) => set({ ternaryZoom: transform }),
  resetTernaryZoom: () => set({ ternaryZoom: DEFAULT_ZOOM }),
  setMapZoom: (transform) => set({ mapZoom: transform }),
  resetMapZoom: () => set({ mapZoom: DEFAULT_ZOOM }),
  setHoveredChartYear: (year) => set({ hoveredChartYear: year }),
}));
