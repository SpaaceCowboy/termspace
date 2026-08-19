'use client'

import { useEffect, useState, type FormEvent } from 'react'

import type { AppearancePreferences } from '@/lib/appearance.ts'

import { Dialog } from './Dialog'
import styles from './Form.module.css'

export function AppearanceDialog({
  open,
  preferences,
  onSave,
  onClose,
}: {
  readonly open: boolean
  readonly preferences: AppearancePreferences
  readonly onSave: (preferences: AppearancePreferences) => void
  readonly onClose: () => void
}) {
  const [draft, setDraft] = useState(preferences)

  useEffect(() => {
    if (open) setDraft(preferences)
  }, [open, preferences])

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    onSave(draft)
    onClose()
  }

  return (
    <Dialog open={open} title="Appearance" onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        <ChoiceGroup
          label="Interface font"
          value={draft.uiFont}
          choices={[['system', 'System sans'], ['mono', 'Monospace']]}
          onChange={(uiFont) => { setDraft((current) => ({ ...current, uiFont })) }}
        />
        <ChoiceGroup
          label="Interface density"
          value={draft.density}
          choices={[['comfortable', 'Comfortable'], ['compact', 'Compact']]}
          onChange={(density) => { setDraft((current) => ({ ...current, density })) }}
        />
        <ChoiceGroup
          label="Contrast"
          value={draft.contrast}
          choices={[['standard', 'Standard'], ['high', 'High contrast']]}
          onChange={(contrast) => { setDraft((current) => ({ ...current, contrast })) }}
        />
        <ChoiceGroup
          label="Terminal palette"
          value={draft.terminalTheme}
          choices={[['midnight', 'Midnight'], ['slate', 'Slate']]}
          onChange={(terminalTheme) => { setDraft((current) => ({ ...current, terminalTheme })) }}
        />
        <ChoiceGroup
          label="Terminal text"
          value={String(draft.terminalFontSize)}
          choices={[['12', 'Small'], ['13', 'Default'], ['15', 'Large']]}
          onChange={(value) => {
            const terminalFontSize = value === '12' ? 12 : value === '15' ? 15 : 13
            setDraft((current) => ({ ...current, terminalFontSize }))
          }}
        />
        <p className={styles.hint}>Changes are stored in this browser and applied to open terminals immediately.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={onClose}>Cancel</button>
          <button type="submit" className={`${styles.button} ${styles.primary}`}>Save appearance</button>
        </div>
      </form>
    </Dialog>
  )
}

function ChoiceGroup<T extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  readonly label: string
  readonly value: T
  readonly choices: readonly (readonly [T, string])[]
  readonly onChange: (value: T) => void
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.label}>{label}</legend>
      <div className={styles.segmented}>
        {choices.map(([choice, text]) => (
          <label key={choice}>
            <input
              type="radio"
              value={choice}
              checked={value === choice}
              onChange={() => { onChange(choice) }}
            />
            <span>{text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
