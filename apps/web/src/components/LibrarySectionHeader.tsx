import type { ReactNode } from 'react';
import { Button } from '@open-design/components';
import { IconArrowRight } from '@tabler/icons-react';
import { useT } from '../i18n';
import styles from './LibrarySectionHeader.module.css';

/** Shared catalogue heading and action treatment for Home and catalogue views. */
export function LibrarySectionHeader({ title, description, onViewAll, actions }: {
  title: string; description: string; onViewAll?: () => void; actions?: ReactNode;
}) {
  const t = useT();
  return <header className={styles.header}>
    <div><h2 className={styles.title}>{title}</h2><p className={styles.description}>{description}</p></div>
    <div className={styles.actions}>{onViewAll && <Button variant="ghost" onClick={onViewAll}>{t('recentProjects.viewAll')}<IconArrowRight size={16} aria-hidden="true" /></Button>}{actions}</div>
  </header>;
}

