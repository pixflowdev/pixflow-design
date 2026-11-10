import { useState, type ReactNode } from 'react';
import { Select } from '@base-ui/react/select';
import { Icon } from './Icon';
import styles from './WorkspaceSelect.module.css';

export function WorkspaceSelect<T extends { value: string; label: string }>({ label, value, options, onValueChange, disabled, placeholder, renderOption, popupContainer }: { label: string; value: string; options: T[]; onValueChange: (value: string) => void; disabled?: boolean; placeholder?: string; popupContainer?: HTMLElement | null; renderOption?: (option: T) => ReactNode }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const selected = options.find(option => option.value === value);
  return <div ref={setContainer} className={styles.field}>
    <Select.Root modal={false} items={options} value={selected ? value : null} onValueChange={next => { if (next !== null) onValueChange(next); }} disabled={disabled}>
      <Select.Trigger aria-label={label} className={styles.control} data-slot="select-trigger">
        <Select.Value className={styles.value}>{selected ? (renderOption?.(selected) ?? selected.label) : placeholder}</Select.Value>
        <Select.Icon className={styles.chevron}><Icon name="chevron-down" size={16}/></Select.Icon>
      </Select.Trigger>
      <Select.Portal container={popupContainer ?? container}>
        <Select.Positioner positionMethod={popupContainer ? 'fixed' : 'absolute'} className={styles.positioner} sideOffset={6} align="start" alignItemWithTrigger={false}>
          <Select.Popup className={styles.popup} data-slot="select-content">
            <Select.List className={styles.list}>
              {options.map(option => <Select.Item key={option.value} value={option.value} className={styles.item}>
                <Select.ItemText className={styles.value}>{renderOption?.(option) ?? option.label}</Select.ItemText>
                <Select.ItemIndicator className={styles.check}><Icon name="check" size={16}/></Select.ItemIndicator>
              </Select.Item>)}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  </div>;
}
