import { useState, useEffect, useRef } from 'react';
import { useMealPlanStore } from '../store/useMealPlanStore';
import DayColumn from './mealplan/DayColumn';
import GenerationProgress from './GenerationProgress';
import HowItWorksNote from './HowItWorksNote';
import ShoppingListModal from './ui/ShoppingListModal';
import { formatError } from '../utils/formatError';
import {
  exportToICS,
  exportSchedulePDF,
  exportShoppingListPDF,
  exportAllRecipesPDF,
  exportFullPlanPDF,
} from '../utils/exportMealPlan';

function formatWeekRange(weekOf: string): string {
  const [y, m, d] = weekOf.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  const startStr = start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  if (start.getMonth() === end.getMonth()) {
    return `${startStr} – ${end.getDate()}`;
  }
  return `${startStr} – ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
}

export default function MealPlanView() {
  const {
    mealPlan, isLoading, progressMessage, error, clearError,
    generationStartedAt, plannedDays, isSample, loadSamplePlan,
    regenSelection, regenerateSelected, clearRegenSelection,
  } = useMealPlanStore();

  const [showShoppingList, setShowShoppingList] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Dates of the days that have already arrived, for the progress panel.
  const arrivedDates = (mealPlan?.mealPlan ?? []).map((d) => d.date);

  useEffect(() => {
    if (!showExportMenu) return;
    function onClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showExportMenu]);

  // Days can arrive while generation is still running (the backend streams
  // each finished day). When at least one day is in, show the calendar
  // instead of the spinner / error screen so the plan builds visibly.
  const hasPartialPlan = !!mealPlan && mealPlan.mealPlan.length > 0;

  if (isLoading && !hasPartialPlan) {
    // No day has arrived yet: show the live progress panel (checklist +
    // timer) instead of a bare spinner, so the wait is visible from the
    // first second.
    return (
      <main className="main-panel main-panel--centered" data-tour="main-panel">
        <GenerationProgress
          startedAt={generationStartedAt}
          plannedDays={plannedDays}
          arrivedDates={arrivedDates}
          progressMessage={progressMessage}
        />
      </main>
    );
  }

  // An error mid-stream keeps the days that already arrived visible; the
  // banner below the header explains what happened instead of wiping them.
  if (error && !hasPartialPlan) {
    return (
      <main className="main-panel main-panel--centered" data-tour="main-panel">
        <div className="error-state">
          <p className="error-state__message">{formatError(error)}</p>
          <button className="btn-dismiss lenso-btn lenso-btn--glass" onClick={clearError}>Dismiss</button>
        </div>
      </main>
    );
  }

  if (!mealPlan) {
    return (
      <main className="main-panel main-panel--centered" data-tour="main-panel">
        <div className="empty-state">
          <img src="/favicon.svg" alt="" className="empty-state__icon" />
          <h2 className="empty-state__title">Your meal plan will appear here</h2>
          <p className="empty-state__body">
            Set your preferences in the sidebar and click <strong>Generate Meal Plan</strong> to create your weekly plan.
          </p>
          <button className="btn-secondary lenso-btn lenso-btn--glass" onClick={loadSamplePlan}>
            Try a sample plan
          </button>
          <p className="empty-state__demo-note">
            No sign-up or API key needed — browse a ready-made 3-day plan.
          </p>
          <HowItWorksNote />
        </div>
      </main>
    );
  }

  const selectionCount = regenSelection.length;
  const shoppingCount = mealPlan.shoppingList.length;
  const weekLabel = formatWeekRange(mealPlan.weekOf);

  function exportAnd(fn: () => void) {
    fn();
    setShowExportMenu(false);
  }

  return (
    <main className="main-panel" data-tour="main-panel">
      <div className="calendar-header">
        <div className="calendar-header__title-group">
          <span className="calendar-header__label">Meal Plan for</span>
          <h2 className="calendar-header__title">
            {weekLabel}
            {isSample && <span className="sample-plan-badge">Sample plan</span>}
          </h2>
        </div>
        <div className="calendar-header__actions">
          <button
            className="calendar-header__shopping-btn lenso-btn lenso-btn--glass"
            onClick={() => setShowShoppingList(true)}
            disabled={shoppingCount === 0}
            data-tour="shopping-btn"
          >
            Shopping List
            {shoppingCount > 0 && (
              <span className="header-action-btn__badge">{shoppingCount}</span>
            )}
          </button>

          <div className="export-menu-wrapper" ref={exportMenuRef}>
            <button
              className="calendar-header__export-btn lenso-btn lenso-btn--glass"
              onClick={() => setShowExportMenu((v) => !v)}
            >
              Export PDF
              <span className="export-menu-caret">{showExportMenu ? '▴' : '▾'}</span>
            </button>
            {showExportMenu && (
              <div className="export-dropdown">
                <button className="lenso-btn lenso-btn--menu" onClick={() => exportAnd(() => exportSchedulePDF(mealPlan, weekLabel))}>
                  Weekly Schedule
                </button>
                <button className="lenso-btn lenso-btn--menu" onClick={() => exportAnd(() => exportShoppingListPDF(mealPlan, weekLabel))}>
                  Shopping List
                </button>
                <button className="lenso-btn lenso-btn--menu" onClick={() => exportAnd(() => exportAllRecipesPDF(mealPlan, weekLabel))}>
                  All Recipes
                </button>
                <div className="export-dropdown__divider" />
                <button className="lenso-btn lenso-btn--menu" onClick={() => exportAnd(() => exportFullPlanPDF(mealPlan, weekLabel))}>
                  Full Plan
                </button>
              </div>
            )}
          </div>

          <button
            className="calendar-header__export-btn lenso-btn lenso-btn--glass"
            onClick={() => exportToICS(mealPlan)}
          >
            Add to Calendar
          </button>
        </div>
      </div>

      {isLoading && (
        <GenerationProgress
          compact
          startedAt={generationStartedAt}
          plannedDays={plannedDays}
          arrivedDates={arrivedDates}
          progressMessage={progressMessage}
        />
      )}
      {error && (
        <div className="error-banner" role="alert">
          <p className="error-state__message">{formatError(error)}</p>
          <button className="btn-dismiss lenso-btn lenso-btn--glass" onClick={clearError}>Dismiss</button>
        </div>
      )}

      <div className="calendar-wrapper">
        <div
          className="calendar-grid"
          style={{ gridTemplateColumns: `repeat(${mealPlan.mealPlan.length}, 1fr)` }}
        >
          {mealPlan.mealPlan.map((day) => (
            <DayColumn key={day.day} day={day} />
          ))}
        </div>
      </div>

      {selectionCount > 0 && (
        <div className="regen-bar">
          <span className="regen-bar__label">
            {selectionCount} meal{selectionCount > 1 ? 's' : ''} selected for replacement
          </span>
          <div className="regen-bar__actions">
            <button className="regen-bar__cancel lenso-btn lenso-btn--glass" onClick={clearRegenSelection}>
              Cancel
            </button>
            <button className="regen-bar__confirm lenso-btn lenso-btn--prominent" onClick={regenerateSelected}>
              Regenerate
            </button>
          </div>
        </div>
      )}

      {showShoppingList && (
        <ShoppingListModal
          onClose={() => setShowShoppingList(false)}
        />
      )}
    </main>
  );
}