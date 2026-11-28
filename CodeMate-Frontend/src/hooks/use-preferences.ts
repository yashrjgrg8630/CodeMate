import { useCallback, useState } from "react";
import { LANGUAGES, type Language } from "@/types/domain";

export interface UserPreferences {
  preferredLanguage: Language;
  autoOptimize: boolean;
  verifyByDefault: boolean;
  notifications: boolean;
  weeklyTarget: number;
}

const STORAGE_KEY = "codemate:preferences";

export const DEFAULT_PREFERENCES: UserPreferences = {
  preferredLanguage: "python",
  autoOptimize: true,
  verifyByDefault: true,
  notifications: false,
  weeklyTarget: 5,
};

function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === "string" && LANGUAGES.some((item) => item.id === value);
}

export function loadPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    const weeklyTarget =
      typeof parsed.weeklyTarget === "number" &&
      Number.isInteger(parsed.weeklyTarget) &&
      parsed.weeklyTarget >= 1 &&
      parsed.weeklyTarget <= 50
        ? parsed.weeklyTarget
        : DEFAULT_PREFERENCES.weeklyTarget;

    return {
      preferredLanguage: isSupportedLanguage(parsed.preferredLanguage)
        ? parsed.preferredLanguage
        : DEFAULT_PREFERENCES.preferredLanguage,
      autoOptimize:
        typeof parsed.autoOptimize === "boolean"
          ? parsed.autoOptimize
          : DEFAULT_PREFERENCES.autoOptimize,
      verifyByDefault:
        typeof parsed.verifyByDefault === "boolean"
          ? parsed.verifyByDefault
          : DEFAULT_PREFERENCES.verifyByDefault,
      notifications:
        typeof parsed.notifications === "boolean"
          ? parsed.notifications
          : DEFAULT_PREFERENCES.notifications,
      weeklyTarget,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: UserPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota or privacy-mode errors.
  }
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(() => loadPreferences());

  const updatePreferences = useCallback((next: UserPreferences) => {
    setPreferences(next);
    savePreferences(next);
  }, []);

  return { preferences, updatePreferences };
}
