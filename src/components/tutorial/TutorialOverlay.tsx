import { useEffect, useState, useCallback, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';
import { TUTORIAL_STEPS } from './tutorialSteps';

const SPOTLIGHT_PAD = 8;
const TOOLTIP_GAP = 12;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getTargetRect(target: string | null): Rect | null {
  if (!target) return null;
  const el = document.querySelector(`[data-tutorial="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

type Side = 'top' | 'bottom' | 'left' | 'right';

function pickSide(rect: Rect, preferred: Side | null, tooltipW: number, tooltipH: number): Side {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sides: Side[] = preferred
    ? [preferred, oppositeSide(preferred), ...perpendicularSides(preferred)]
    : ['bottom', 'right', 'left', 'top'];

  for (const side of sides) {
    if (side === 'bottom' && rect.top + rect.height + SPOTLIGHT_PAD + TOOLTIP_GAP + tooltipH < vh) return side;
    if (side === 'top' && rect.top - SPOTLIGHT_PAD - TOOLTIP_GAP - tooltipH > 0) return side;
    if (side === 'right' && rect.left + rect.width + SPOTLIGHT_PAD + TOOLTIP_GAP + tooltipW < vw) return side;
    if (side === 'left' && rect.left - SPOTLIGHT_PAD - TOOLTIP_GAP - tooltipW > 0) return side;
  }
  return 'bottom'; // fallback
}

function oppositeSide(s: Side): Side {
  const map: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  return map[s];
}

function perpendicularSides(s: Side): Side[] {
  return s === 'top' || s === 'bottom' ? ['left', 'right'] : ['top', 'bottom'];
}

function getTooltipPosition(rect: Rect, side: Side, tooltipW: number, tooltipH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = 0;
  let left = 0;

  switch (side) {
    case 'bottom':
      top = rect.top + rect.height + SPOTLIGHT_PAD + TOOLTIP_GAP;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case 'top':
      top = rect.top - SPOTLIGHT_PAD - TOOLTIP_GAP - tooltipH;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.left + rect.width + SPOTLIGHT_PAD + TOOLTIP_GAP;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.left - SPOTLIGHT_PAD - TOOLTIP_GAP - tooltipW;
      break;
  }

  // Clamp to viewport
  left = Math.max(12, Math.min(left, vw - tooltipW - 12));
  top = Math.max(12, Math.min(top, vh - tooltipH - 12));

  return { top, left };
}

export function TutorialOverlay() {
  const { tutorialStep, endTutorial, nextTutorialStep, prevTutorialStep } = useUIStore();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipSize, setTooltipSize] = useState({ w: 360, h: 200 });

  const step = tutorialStep !== null ? TUTORIAL_STEPS[tutorialStep] : null;

  const measure = useCallback(() => {
    if (!step) return;
    const rect = getTargetRect(step.target);
    setTargetRect(rect);
    if (tooltipRef.current) {
      const r = tooltipRef.current.getBoundingClientRect();
      setTooltipSize({ w: r.width, h: r.height });
    }
  }, [step]);

  // Measure on step change and on resize/scroll
  useEffect(() => {
    if (tutorialStep === null) return;
    // Initial measure after a frame (so DOM has rendered)
    const raf = requestAnimationFrame(measure);

    const handleResize = () => measure();
    const handleScroll = () => measure();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [tutorialStep, measure]);

  // Re-measure once tooltip renders to get its true size
  useEffect(() => {
    if (!tooltipRef.current) return;
    const obs = new ResizeObserver(() => {
      if (tooltipRef.current) {
        const r = tooltipRef.current.getBoundingClientRect();
        setTooltipSize({ w: r.width, h: r.height });
      }
    });
    obs.observe(tooltipRef.current);
    return () => obs.disconnect();
  }, [tutorialStep]);

  // Keyboard navigation
  useEffect(() => {
    if (tutorialStep === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { endTutorial(); return; }
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); nextTutorialStep(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prevTutorialStep(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [tutorialStep, endTutorial, nextTutorialStep, prevTutorialStep]);

  if (tutorialStep === null || !step) return null;

  const isCentered = step.target === null || !targetRect;
  const isLastStep = tutorialStep === TUTORIAL_STEPS.length - 1;
  const isFirstStep = tutorialStep === 0;

  // Spotlight rect (with padding)
  const spotlightStyle: React.CSSProperties = isCentered
    ? {}
    : {
        position: 'fixed',
        top: targetRect!.top - SPOTLIGHT_PAD,
        left: targetRect!.left - SPOTLIGHT_PAD,
        width: targetRect!.width + SPOTLIGHT_PAD * 2,
        height: targetRect!.height + SPOTLIGHT_PAD * 2,
        borderRadius: 12,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
        transition: 'all 300ms ease',
        zIndex: 60,
        pointerEvents: 'none' as const,
      };

  // Tooltip position
  let tooltipStyle: React.CSSProperties;
  if (isCentered) {
    tooltipStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 61,
    };
  } else {
    const side = pickSide(targetRect!, step.preferredSide, tooltipSize.w, tooltipSize.h);
    const pos = getTooltipPosition(targetRect!, side, tooltipSize.w, tooltipSize.h);
    tooltipStyle = {
      position: 'fixed',
      top: pos.top,
      left: pos.left,
      zIndex: 61,
    };
  }

  return (
    <>
      {/* Click-catcher backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          ...(isCentered ? { backgroundColor: 'rgba(0,0,0,0.5)' } : {}),
        }}
        onClick={endTutorial}
      />

      {/* Spotlight cutout */}
      {!isCentered && <div style={spotlightStyle} />}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        style={tooltipStyle}
        className="bg-white rounded-xl shadow-2xl max-w-sm w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          {/* Step counter */}
          <div className="text-xs text-gray-400 mb-1">
            {tutorialStep + 1} / {TUTORIAL_STEPS.length}
          </div>

          <h3 className="text-base font-semibold text-gray-900 mb-2">{step.title}</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>
        </div>

        {/* Button row */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
          <button
            onClick={endTutorial}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={prevTutorialStep}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={isLastStep ? endTutorial : nextTutorialStep}
              className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              {isLastStep ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
