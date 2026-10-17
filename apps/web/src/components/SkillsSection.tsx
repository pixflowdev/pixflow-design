import { useT as usePixflowUiTranslation } from '../i18n';
import {useEffect, useState} from 'react';
import type {Dispatch, SetStateAction} from 'react';
import {Button, Input} from '@open-design/components';
import type {SkillSummary, LockedSkillSummary} from '@open-design/contracts';
import type {AppConfig} from '../types';
import {fetchSkill} from '../providers/registry';
import {useI18n} from '../i18n';
import {localizeSkillName, localizeSkillDescription} from '../i18n/content';
import {customSkillsAvailable, ProSkillsSection} from '../pixflow/custom-skills-contribution';
import styles from './FreeSkillsSection.module.css';
import {pixflowRuntimeFetch} from '../pixflow/runtime-fetch';
import {readLockedSkills} from '../pixflow/locked-skills';
import {SkillLibraryPanel} from './SkillLibraryPanel';
import type {SkillLibraryCatalogue} from './useSkillLibraryCatalogue';
import {invalidateSkillsCache} from '../providers/registry';
interface Props {cfg:AppConfig; setCfg:Dispatch<SetStateAction<AppConfig>>; onSkillsRefresh?:()=>Promise<void>|void; onSkillsChanged?:(id?:string)=>void; skillLibraryCatalogue?:SkillLibraryCatalogue}
export function SkillsSection(props:Props) {
  return <><SkillLibraryPanel catalogue={props.skillLibraryCatalogue} onChange={async()=>{invalidateSkillsCache();await props.onSkillsRefresh?.();props.onSkillsChanged?.();}}/>{customSkillsAvailable() ? <ProSkillsSection {...props}/> : <BuiltInSkills {...props}/>}</>;
}
function BuiltInSkills({cfg,setCfg}:Props) {
  const translateUi = usePixflowUiTranslation();
  const {t,locale}=useI18n();
  const [skills,setSkills]=useState<SkillSummary[]>([]);
  const [lockedSkills,setLockedSkills]=useState<LockedSkillSummary[]>([]);
  const [search,setSearch]=useState('');
  const [open,setOpen]=useState<string|null>(null);
  const [body,setBody]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;void pixflowRuntimeFetch('/api/skills').then(async response=>{if(!response.ok)throw new Error(translateUi("ui.skillsSection.feedback93"));return response.json()}).then(payload=>{if(active){setSkills((Array.isArray(payload.skills)?payload.skills:[]).filter((item:SkillSummary)=>item.source!=='user'));setLockedSkills(readLockedSkills(payload));}}).catch(error=>{if(active)setError(String(error))});return()=>{active=false}},[]);
  useEffect(()=>{let active=true;setBody('');setError('');if(open)void fetchSkill(open).then(skill=>{if(active)setBody(skill?.body??'')}).catch(error=>{if(active)setError(String(error))});return()=>{active=false}},[open]);
  return <section className={styles.section}>
    <Input type="search" className={styles.search} aria-label={t('settings.librarySearch')} placeholder={t('settings.librarySearch')} value={search} onChange={e=>setSearch(e.target.value)}/>
    {error&&<p role="alert">{error}</p>}
    {skills.filter(skill=>(skill.name+' '+skill.description+' '+localizeSkillName(locale,skill)+' '+localizeSkillDescription(locale,skill)).toLowerCase().includes(search.toLowerCase())).map(skill=><article className={styles.row} key={skill.id}>
      <div className={styles.header}><Button variant="ghost" onClick={()=>setOpen(open===skill.id?null:skill.id)} aria-expanded={open===skill.id}>{localizeSkillName(locale,skill)}</Button>
      <label className="toggle-switch toggle-switch-sm"><input type="checkbox" aria-label={localizeSkillName(locale,skill)} checked={!(cfg.disabledSkills??[]).includes(skill.id)} onChange={e=>{const checked=e.currentTarget.checked;setCfg(previous=>({...previous,disabledSkills:checked?(previous.disabledSkills??[]).filter(id=>id!==skill.id):[...(previous.disabledSkills??[]),skill.id]}))}}/><span className="toggle-slider"/></label></div>
      <p>{localizeSkillDescription(locale,skill)}</p>{open===skill.id&&<pre className={styles.body}>{body}</pre>}
    </article>)}
    {lockedSkills.filter(skill=>!skills.some(active=>active.id===skill.id)&&(skill.name+' '+skill.description+' '+localizeSkillName(locale,skill)+' '+localizeSkillDescription(locale,skill)).toLowerCase().includes(search.toLowerCase())).map(skill=><article className={`${styles.row} ${styles.locked}`} key={skill.id} aria-disabled="true">
      <div className={styles.header}><span className={styles.lockedName}>{localizeSkillName(locale,skill)}</span><span className={styles.proBadge}>{translateUi("ui.chatComposer.pro")}</span></div>
      <p>{localizeSkillDescription(locale,skill)}</p>
    </article>)}
  </section>;
}
