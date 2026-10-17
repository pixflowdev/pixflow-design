import { useId } from 'react';
import { Button } from '@open-design/components';
import { useT } from '../i18n';
import { Icon } from '../components/Icon';
import { IconPalette, IconWand } from '@tabler/icons-react';
import styles from './BricksStylingOptions.module.css';
import { DesignSystemSwitch } from './DesignSystemSwitch';

export function BricksStylingOptions({ useSiteStyles = true, onChange, disabled }: {
  useSiteStyles?: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const id = useId();
  return <div className={styles.group} role="group" aria-labelledby={id}>
    <div id={id} className={styles.heading}>{t('pixflow.styling.label')}</div>
    {[true, false].map(value => <Button key={String(value)} role="menuitemradio"
      className={styles.option} aria-checked={useSiteStyles === value} disabled={disabled}
      onClick={() => onChange(value)}>
      {value ? <IconPalette size={16} stroke={1.6} aria-hidden="true" /> : <IconWand size={16} stroke={1.6} aria-hidden="true" />}
      <span className={styles.optionLabel}>{t(value ? 'pixflow.styling.site' : 'pixflow.styling.custom')}</span>
      {useSiteStyles === value && <Icon name="check" size={13} />}
    </Button>)}
    <p className={styles.hint}>{t('pixflow.styling.classes')}</p>
    <DesignSystemSwitch disabled={disabled} />
  </div>;
}
