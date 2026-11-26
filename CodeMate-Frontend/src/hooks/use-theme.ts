import { useEffect } from "react";

export type ThemeMode = "dark";

export function useTheme() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    window.localStorage.setItem("codemate-theme", "dark");
  }, []);

  return {
    theme: "dark" as ThemeMode,
    setTheme: (_next: ThemeMode) => {},
    toggleTheme: () => {},
  };
}
