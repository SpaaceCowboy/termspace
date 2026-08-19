import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  applyAppearance,
  parseAppearance,
  readAppearance,
} from './appearance.ts'

test('appearance parsing accepts only closed preference values', () => {
  assert.deepEqual(parseAppearance({
    uiFont: 'mono',
    density: 'compact',
    contrast: 'high',
    terminalTheme: 'slate',
    terminalFontSize: 15,
    ignored: true,
  }), {
    uiFont: 'mono',
    density: 'compact',
    contrast: 'high',
    terminalTheme: 'slate',
    terminalFontSize: 15,
  })
  assert.deepEqual(parseAppearance({ uiFont: 'comic-sans', terminalFontSize: 99 }), DEFAULT_APPEARANCE)
})

test('appearance storage falls back on malformed JSON and applies data attributes', () => {
  assert.deepEqual(readAppearance({ getItem: () => '{' }), DEFAULT_APPEARANCE)
  assert.deepEqual(readAppearance({ getItem: (key) => key === APPEARANCE_STORAGE_KEY
    ? JSON.stringify({ density: 'compact' })
    : null }), { ...DEFAULT_APPEARANCE, density: 'compact' })

  const root = { dataset: {} as DOMStringMap }
  applyAppearance(root, { ...DEFAULT_APPEARANCE, uiFont: 'mono', contrast: 'high' })
  assert.deepEqual(root.dataset, {
    tsFont: 'mono',
    tsDensity: 'comfortable',
    tsContrast: 'high',
  })
})
