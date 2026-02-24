import { useEffect, useState } from 'react';
import { useUIStore, TUTORIAL_MIN_WIDTH } from '@/store/uiStore';
import { useElectionStore } from '@/store/electionStore';

const STORAGE_KEY = 'ukge-tutorial-seen';

export function WelcomePrompt() {
  const [visible, setVisible] = useState(false);
  const tutorialStep = useUIStore((s) => s.tutorialStep);
  const startTutorial = useUIStore((s) => s.startTutorial);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    if (window.innerWidth < TUTORIAL_MIN_WIDTH) return;
    if (tutorialStep !== null) return;

    const timer = setTimeout(() => {
      // Re-check conditions at display time
      if (localStorage.getItem(STORAGE_KEY)) return;
      if (window.innerWidth < TUTORIAL_MIN_WIDTH) return;
      if (useUIStore.getState().tutorialStep !== null) return;
      setVisible(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [tutorialStep]);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  const handleTakeTour = () => {
    dismiss();
    // Unpin comparison mode before starting tutorial
    const { pinnedYear, unpinYear } = useElectionStore.getState();
    if (pinnedYear !== null) unpinYear();
    startTutorial();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={dismiss}
      />
      {/* Modal */}
      <div
        style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 61 }}
        className="bg-white rounded-xl shadow-2xl max-w-sm w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Welcome!</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            This is an interactive explorer for UK General Elections from 1955 to 2024. Would you like a quick guided tour of the features?
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            onClick={dismiss}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            No thanks
          </button>
          <button
            onClick={handleTakeTour}
            className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Take the tour
          </button>
        </div>
      </div>
    </>
  );
}
