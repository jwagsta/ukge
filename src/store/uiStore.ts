import { create } from 'zustand';

export type MapType = 'choropleth' | 'dots' | 'hex';
export type MobileTab = 'map' | 'charts' | 'ternary';

export interface ZoomTransform {
  k: number; // scale
  x: number; // translate x
  y: number; // translate y
}

export interface ChartXZoom {
  k: number;  // x-axis scale factor (1 = no zoom)
  x: number;  // x-axis translate in pixels
}

export const MOBILE_BREAKPOINT = 640;

interface UIState {
  mapType: MapType;
  mapColorMode: string;
  votesPerDot: number;
  sidebarOpen: boolean;
  isMobile: boolean;
  mobileTab: MobileTab;
  ternaryZoom: ZoomTransform;
  mapZoom: ZoomTransform;
  chartXZoom: ChartXZoom;
  hoveredChartYear: number | null;

  setMapType: (type: MapType) => void;
  setMapColorMode: (mode: string) => void;
  setVotesPerDot: (value: number) => void;
  toggleSidebar: () => void;
  setIsMobile: (value: boolean) => void;
  setMobileTab: (tab: MobileTab) => void;
  setTernaryZoom: (transform: ZoomTransform) => void;
  resetTernaryZoom: () => void;
  setMapZoom: (transform: ZoomTransform) => void;
  resetMapZoom: () => void;
  setChartXZoom: (zoom: ChartXZoom) => void;
  resetChartXZoom: () => void;
  setHoveredChartYear: (year: number | null) => void;
}

const DEFAULT_ZOOM: ZoomTransform = { k: 1, x: 0, y: 0 };
const DEFAULT_CHART_X_ZOOM: ChartXZoom = { k: 1, x: 0 };

export const useUIStore = create<UIState>((set) => ({
  mapType: 'choropleth',
  mapColorMode: 'winner',
  votesPerDot: 10000,
  sidebarOpen: true,
  isMobile: false,
  mobileTab: 'map',
  ternaryZoom: DEFAULT_ZOOM,
  mapZoom: DEFAULT_ZOOM,
  chartXZoom: DEFAULT_CHART_X_ZOOM,
  hoveredChartYear: null,

  setMapType: (type) => set((state) => ({
    mapType: type,
    mapColorMode: type === 'dots' ? 'winner' : state.mapColorMode,
  })),
  setMapColorMode: (mode) => set({ mapColorMode: mode }),
  setVotesPerDot: (value) => set({ votesPerDot: value }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setIsMobile: (value) => set({ isMobile: value, sidebarOpen: !value }),
  setMobileTab: (tab) => set({ mobileTab: tab }),
  setTernaryZoom: (transform) => set({ ternaryZoom: transform }),
  resetTernaryZoom: () => set({ ternaryZoom: DEFAULT_ZOOM }),
  setMapZoom: (transform) => set({ mapZoom: transform }),
  resetMapZoom: () => set({ mapZoom: DEFAULT_ZOOM }),
  setChartXZoom: (zoom) => set({ chartXZoom: zoom }),
  resetChartXZoom: () => set({ chartXZoom: DEFAULT_CHART_X_ZOOM }),
  setHoveredChartYear: (year) => set({ hoveredChartYear: year }),
}));
