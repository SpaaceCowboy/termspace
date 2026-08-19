'use client'

import { useCallback, useEffect, useState } from 'react'

export const APPEARANCE_STORAGE_KEY = 'termspace:appearance:v1'

export type UiFont = 'system' | 'mono'
export type UiDensity = 'comfortable' | 'compact'
export type UiContrast = 'standard' | 'high'
export type TerminalTheme = 'midnight' | 'slate'
export type TerminalFontSize = 12 | 13 | 15

export interface AppearancePreferences {
  readonly uiFont: UiFont
  readonly density: UiDensity
  readonly contrast: UiContrast
  readonly terminalTheme: TerminalTheme
  readonly terminalFontSize: TerminalFontSize
}

export interface TerminalAppearance {
  readonly theme: TerminalTheme
  readonly fontSize: TerminalFontSize
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  uiFont: 'system',
  density: 'comfortable',
  contrast: 'standard',
  terminalTheme: 'midnight',
  terminalFontSize: 13,
}

export function parseAppearance(value: unknown): AppearancePreferences {
  if (typeof value !== 'object' || value === null) return DEFAULT_APPEARANCE
  const candidate = value as Record<string, unknown>
  return {
    uiFont: candidate.uiFont === 'mono' ? 'mono' : 'system',
    density: candidate.density === 'compact' ? 'compact' : 'comfortable',
    contrast: candidate.contrast === 'high' ? 'high' : 'standard',
    terminalTheme: candidate.terminalTheme === 'slate' ? 'slate' : 'midnight',
    terminalFontSize:
      candidate.terminalFontSize === 12 ||
      candidate.terminalFontSize === 15
        ? candidate.terminalFontSize
        : 13,
  }
}

export function readAppearance(storage: Pick<Storage, 'getItem'>): AppearancePreferences {
  try {
    const raw = storage.getItem(APPEARANCE_STORAGE_KEY)
    return raw === null ? DEFAULT_APPEARANCE : parseAppearance(JSON.parse(raw) as unknown)
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export function applyAppearance(
  root: Pick<HTMLElement, 'dataset'>,
  preferences: AppearancePreferences,
): void {
  root.dataset.tsFont = preferences.uiFont
  root.dataset.tsDensity = preferences.density
  root.dataset.tsContrast = preferences.contrast
}

export function useAppearance() {
  const [preferences, setPreferences] = useState<AppearancePreferences>(DEFAULT_APPEARANCE)

  useEffect(() => {
    const stored = readAppearance(window.localStorage)
    setPreferences(stored)
    applyAppearance(document.documentElement, stored)
  }, [])

  const save = useCallback((next: AppearancePreferences) => {
    const validated = parseAppearance(next)
    setPreferences(validated)
    applyAppearance(document.documentElement, validated)
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(validated))
    } catch {
      // The current page can still honor the choice when storage is unavailable.
    }
  }, [])

  return { preferences, save }
}
