import { ViewMode } from '../types';

export interface UserPreferences {
  defaultBorderThickness: number;
  previewBg: 'checker' | 'dark' | 'light' | 'saturated';
  preferredViewMode: ViewMode;
}

const PREFERENCES_KEY = 'sticker_studio_user_preferences_v1';

const DEFAULT_PREFERENCES: UserPreferences = {
  defaultBorderThickness: 20,
  previewBg: 'checker',
  preferredViewMode: 'sheet'
};

export function loadUserPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      defaultBorderThickness: typeof parsed.defaultBorderThickness === 'number' ? parsed.defaultBorderThickness : 20,
      previewBg: ['checker', 'dark', 'light', 'saturated'].includes(parsed.previewBg) ? parsed.previewBg : 'checker',
      preferredViewMode: ['sheet', 'grid'].includes(parsed.preferredViewMode) ? parsed.preferredViewMode : 'sheet'
    };
  } catch (e) {
    return DEFAULT_PREFERENCES;
  }
}

export function saveUserPreferences(prefs: Partial<UserPreferences>): void {
  try {
    const current = loadUserPreferences();
    const updated = { ...current, ...prefs };
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated));
  } catch (e) {
    // Non-fatal if localStorage is restricted
  }
}
