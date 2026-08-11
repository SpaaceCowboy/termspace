'use client'

import { LAYOUT_MODES, type LayoutMode } from '@termspace/contracts'

import { cx } from '@/lib/cx'

import styles from './LayoutToolbar.module.css'

const MODE_LABELS: Readonly<Record<LayoutMode, string>> = {
  single: '1',
  split: '2',
  grid: '2×2',
  tabs: 'Tabs',
}

const MODE_DESCRIPTIONS: Readonly<Record<LayoutMode, string>> = {
  single: 'One pane',
  split: 'Two panes side by side',
  grid: 'Four panes in a 2×2 grid',
  tabs: 'One pane at a time, with tabs',
}

export interface LayoutToolbarProps {
  mode: LayoutMode
  onChange: (mode: LayoutMode) => void
  disabled?: boolean
}

export function LayoutToolbar({ mode, onChange, disabled = false }: LayoutToolbarProps) {
  return (
    <div className={styles.toolbar} role="group" aria-label="Pane layout">
      {LAYOUT_MODES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          className={cx(styles.mode, candidate === mode && styles.modeActive)}
          aria-pressed={candidate === mode}
          title={MODE_DESCRIPTIONS[candidate]}
          disabled={disabled}
          onClick={() => {
            onChange(candidate)
          }}
        >
          <span aria-hidden="true">{MODE_LABELS[candidate]}</span>
          <span className="ts-visually-hidden">{MODE_DESCRIPTIONS[candidate]}</span>
        </button>
      ))}
    </div>
  )
}
