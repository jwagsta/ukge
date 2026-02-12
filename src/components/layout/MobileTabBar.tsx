import { useUIStore, type MobileTab } from '@/store/uiStore';

const tabs: { id: MobileTab; label: string; icon: JSX.Element }[] = [
  {
    id: 'map',
    label: 'Map',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
        <path d="M8 2v16" />
        <path d="M16 6v16" />
      </svg>
    ),
  },
  {
    id: 'charts',
    label: 'Charts',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3v18h18" />
        <path d="M7 16l4-8 4 4 4-8" />
      </svg>
    ),
  },
  {
    id: 'ternary',
    label: 'Ternary',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 20h20L12 2z" />
        <circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

export function MobileTabBar() {
  const { mobileTab, setMobileTab } = useUIStore();

  return (
    <nav className="flex border-t border-gray-200 bg-white" style={{ height: 52, touchAction: 'manipulation' }}>
      {tabs.map((tab) => {
        const isActive = mobileTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setMobileTab(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              isActive
                ? 'text-blue-600'
                : 'text-gray-400'
            }`}
            style={{ minHeight: 44 }}
          >
            {tab.icon}
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
