import { create } from 'zustand';

export type MapType = 'choropleth' | 'dots' | 'hex' | 'small-multiples';

export interface ZoomTransform {
  k: number; // scale
  x: number; // translate x
  y: number; // translate y
}

interface UIState {
  mapType: MapType;
  votesPerDot: number;
  sidebarOpen: boolean;
  isMobile: boolean;
  ternaryZoom: ZoomTransform;
  mapZoom: ZoomTransform;

  setMapType: (type: MapType) => void;
  setVotesPerDot: (value: number) => void;
  toggleSidebar: () => void;
  setIsMobile: (value: boolean) => void;
  setTernaryZoom: (transform: ZoomTransform) => void;
  resetTernaryZoom: () => void;
  setMapZoom: (transform: ZoomTransform) => void;
  resetMapZoom: () => void;
}

const DEFAULT_ZOOM: ZoomTransform = { k: 1, x: 0, y: 0 };

export const useUIStore = create<UIState>((set) => ({
  mapType: 'choropleth',
  votesPerDot: 10000,
  sidebarOpen: true,
  isMobile: false,
  ternaryZoom: DEFAULT_ZOOM,
  mapZoom: DEFAULT_ZOOM,

  setMapType: (type) => set({ mapType: type }),
  setVotesPerDot: (value) => set({ votesPerDot: value }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setIsMobile: (value) => set({ isMobile: value, sidebarOpen: !value }),
  setTernaryZoom: (transform) => set({ ternaryZoom: transform }),
  resetTernaryZoom: () => set({ ternaryZoom: DEFAULT_ZOOM }),
  setMapZoom: (transform) => set({ mapZoom: transform }),
  resetMapZoom: () => set({ mapZoom: DEFAULT_ZOOM }),
}));
