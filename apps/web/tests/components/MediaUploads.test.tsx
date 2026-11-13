// @vitest-environment jsdom
import React from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {MediaDropOverlay,MediaUploadQueue} from '../../src/components/MediaUploads';
import {en} from '../../src/i18n/locales/en';
vi.mock('../../src/i18n',()=>({useT:()=> (key:keyof typeof en,params:Record<string,string>={})=>Object.entries(params).reduce((text,[name,value])=>text.replaceAll('{'+name+'}',value),en[key])}));
afterEach(cleanup);
it('shows upload instructions only while external files are over the library',()=>{
 const view=render(<MediaDropOverlay active={false}/>);expect(screen.getByText('Drop files here to upload').parentElement?.getAttribute('aria-hidden')).toBe('true');
 view.rerender(<MediaDropOverlay active/>);expect(screen.getByText('Drop files here to upload').parentElement?.getAttribute('aria-hidden')).toBe('false');
});
it('exposes per-file progress, queued and error states',()=>{
 render(<MediaUploadQueue jobs={['uploading','queued','error'].map((status,i)=>({id:i,file:new File(['x'],`image-${i}.png`),status:status as 'uploading'|'queued'|'error',progress:i===0?42:0,error:i===2?'Rejected file':undefined,run:async()=>{}}))} onRetry={()=>{}} onClear={()=>{}}/>);
 expect(screen.getByRole('progressbar',{name:'image-0.png'}).getAttribute('aria-valuenow')).toBe('42');
 expect(screen.getByText(/Queued/)).toBeTruthy();expect(screen.getByRole('alert').textContent).toBe('Rejected file');
 expect(screen.getByRole('button',{name:'Retry'})).toBeTruthy();
});

it('distinguishes rendered previews, saved copies, and replaced originals in a mixed queue', () => {
 const jobs = [
  {operation:'preview', status:'rendering', label:'Rendering preview…'},
  {operation:'preview', status:'done', label:'Preview rendered (not saved)'},
  {operation:'copy', status:'saving', label:'Saving copy…'},
  {operation:'copy', status:'done', label:'Copy saved'},
  {operation:'replace', status:'saving', label:'Replacing original…'},
  {operation:'replace', status:'done', label:'Original replaced'},
 ] as const;
 render(<MediaUploadQueue
  jobs={jobs.map(({operation,status},id)=>({id,operation,status,progress:0,file:new File([], `image-${id}.png`,{type:'image/png'}),run:async()=>{}}))}
  onRetry={()=>{}} onClear={()=>{}} operationLabel="Image upscaling"
 />);
 for(const {label} of jobs) expect(screen.getByText(label)).toBeTruthy();
 expect(screen.getByRole('progressbar',{name:'image-2.png'}).getAttribute('aria-valuenow')).toBeNull();
});
