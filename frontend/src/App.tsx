import { useEffect, useState } from 'react';
import './index.css';
import { useThemeStore } from './store/useThemeStore';
import { useMealPlanStore } from './store/useMealPlanStore';
import { useAccessStore } from './store/useAccessStore';
import ThemeToggle from './components/ThemeToggle';
import Sidebar from './components/Sidebar';
import MealPlanView from './components/MealPlanView';
import BlacklistModal from './components/ui/BlacklistModal';
import FavoritesModal from './components/ui/FavoritesModal';
import PantryModal from './components/ui/PantryModal';
import HelpModal from './components/ui/HelpModal';
import RateLimitModal from './components/ui/RateLimitModal';
import GuidedTour from './components/GuidedTour';

export default function App() {
  const theme = useThemeStore((s) => s.theme);
  const error = useMealPlanStore((s) => s.error);
  const clearError = useMealPlanStore((s) => s.clearError);
  const initializeAccess = useAccessStore((s) => s.initialize);

  const isRateLimited = error?.startsWith('RATE_LIMITED:') ?? false;
  const rateLimitResetAt = isRateLimited ? parseInt(error!.split(':')[1]) : 0;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showBlacklist, setShowBlacklist] = useState(false);
  const [showPantry, setShowPantry] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showTour, setShowTour] = useState(() => !localStorage.getItem('forkcastai-tour-seen'));

  function finishTour() {
    localStorage.setItem('forkcastai-tour-seen', '1');
    setShowTour(false);
  }

  function restartTour() {
    setShowHelp(false);
    setShowTour(true);
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // The access store is still initialized on mount: the RateLimitModal
  // reads `trusted` to pick its message (2 requests/day vs 10 with
  // Full Access), so without this call it would always show the
  // untrusted wording even for a trusted browser. There is no visible
  // access badge in the header anymore.
  useEffect(() => {
    initializeAccess();
  }, [initializeAccess]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)');
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        {/* Chopping board: a cartoon wooden board drawn as an inline SVG
            behind the header content. Face + grain + knife cuts + a darker
            bottom strip for the board's thickness, so it reads 3D. The
            viewBox is the desktop bar (720x56); preserveAspectRatio="none"
            stretches it to the bar, which is fine for wood grain. Same
            literal wood in both themes, like the black bar before it. */}
        <svg className="app-header__board" viewBox="0 0 720 56" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M1 1 H719 V35 Q719 55 699 55 H21 Q1 55 1 35 Z" fill="#DEA85E" stroke="#7A4A16" strokeWidth="2" />
          <path d="M1 47 H719 V35 Q719 55 699 55 H21 Q1 55 1 35 Z" fill="#A96F2E" />
          <line x1="4" y1="3.5" x2="716" y2="3.5" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
          <line x1="4" y1="45.5" x2="716" y2="45.5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M0 16 C120 11 240 20 360 15 S600 11 720 16" fill="none" stroke="#C08A45" strokeWidth="1.5" opacity="0.45" />
          <path d="M0 28 C140 33 260 24 400 29 S620 24 720 30" fill="none" stroke="#C08A45" strokeWidth="1.5" opacity="0.45" />
          <path d="M0 39 C110 35 250 42 380 38 S610 35 720 40" fill="none" stroke="#C08A45" strokeWidth="1.5" opacity="0.4" />
          <g stroke="#8A5A22" strokeWidth="2" strokeLinecap="round" opacity="0.6">
            <line x1="205" y1="18" x2="202" y2="30" />
            <line x1="218" y1="24" x2="222" y2="34" />
            <line x1="228" y1="14" x2="226" y2="28" />
            <line x1="212" y1="34" x2="215" y2="43" />
            <line x1="492" y1="16" x2="488" y2="29" />
            <line x1="505" y1="22" x2="508" y2="33" />
            <line x1="518" y1="13" x2="516" y2="25" />
            <line x1="498" y1="34" x2="502" y2="43" />
            <line x1="524" y1="30" x2="521" y2="40" />
          </g>
          <g stroke="#F2CD8F" strokeWidth="1.5" strokeLinecap="round" opacity="0.7">
            <line x1="207" y1="18" x2="204" y2="30" />
            <line x1="494" y1="16" x2="490" y2="29" />
          </g>
        </svg>
        <div className="app-header__left">
          <button
            className="app-header__hamburger lenso-btn lenso-btn--icon"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
          >
            <span /><span /><span />
          </button>
          <span className="app-header__wordmark">
            <img src="/favicon.svg" alt="" className="app-header__logo-mark" />
            <span className="app-header__logo">forkcastAI</span>
          </span>
        </div>

        <nav className="app-header__nav" aria-label="Library">
          <button
            type="button"
            className="app-header__nav-link"
            onClick={() => setShowPantry(true)}
            data-tour="pantry-btn"
          >
            Pantry
          </button>
          <button
            type="button"
            className="app-header__nav-link"
            onClick={() => setShowFavorites(true)}
            data-tour="favorites-btn"
          >
            Favorites
          </button>
          <button
            type="button"
            className="app-header__nav-link"
            onClick={() => setShowBlacklist(true)}
            data-tour="blacklist-btn"
          >
            Recent Recipes
          </button>
        </nav>

        <div className="app-header__actions">
          <ThemeToggle />
          <button
            className="header-action-btn header-action-btn--help lenso-btn lenso-btn--icon"
            onClick={() => setShowHelp(true)}
            aria-label="Help"
            data-tour="help-btn"
          >
            ?
          </button>
        </div>
      </header>

      <div className="app-body">
        {sidebarOpen && (
          <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        )}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <MealPlanView />
      </div>

      {showPantry && <PantryModal onClose={() => setShowPantry(false)} />}
      {showFavorites && <FavoritesModal onClose={() => setShowFavorites(false)} />}
      {showBlacklist && <BlacklistModal onClose={() => setShowBlacklist(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} onRestartTour={restartTour} />}
      {isRateLimited && <RateLimitModal resetAt={rateLimitResetAt} onClose={clearError} />}
      {showTour && (
        <GuidedTour
          onFinish={finishTour}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}