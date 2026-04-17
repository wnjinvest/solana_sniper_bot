'use client';

import { useState, useEffect, useCallback } from 'react';

type Theme = 'dark' | 'light';

export function useLocalTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');

  // Sync state from DOM on mount (DOM was already set by the inline script)
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    setThemeState(stored === 'light' ? 'light' : 'dark');
  }, []);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem('theme', next);
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(next);
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggle };
}
