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

        <span className="app-header__notch-corner app-header__notch-corner--left" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M 0 0 L 20 0 C 8.954 0 0 8.954 0 20 Z" fill="#000000" />
          </svg>
        </span>
        <span className="app-header__notch-corner app-header__notch-corner--right" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M 0 0 L 20 0 C 8.954 0 0 8.954 0 20 Z" fill="#000000" />
          </svg>
        </span>
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