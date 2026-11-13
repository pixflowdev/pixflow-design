// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { MediaView } from '../../src/components/MediaView';
import { MEDIA_DRAG_TYPE } from '../../src/components/MediaFolders';
import { mediaFolders } from '../../src/providers/media-folders';
import { fetchPixflowMedia } from '../../src/providers/registry';

vi.mock('../../src/providers/media-folders', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/providers/media-folders')>(),
  mediaFolders: vi.fn(),
}));
vi.mock('../../src/providers/registry', () => ({ fetchPixflowMedia: vi.fn() }));
vi.mock('../../src/pixflow/upscaler-access', () => ({ useUpscalerInventory: () => ({}) }));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});

function renderMediaLibrary() {
  const items = [1, 2, 3, 4].map(id => ({
    id: String(id), attachmentId: id, type: 'image' as const, mimeType: 'image/png',
    filename: 'Photo-'+id+'.png', title: 'Photo '+id, url: '/photo-'+id+'.png',
    sizeBytes: 100, width: 100, height: 100, source: 'upload',
  })) as Awaited<ReturnType<typeof fetchPixflowMedia>>['items'];
  vi.mocked(fetchPixflowMedia).mockResolvedValue({ok:true,items,total:items.length,page:1,perPage:30,availableTypes:[]});
  vi.mocked(mediaFolders).mockResolvedValue({
    provider:'pixflow', writable:true, happyfilesAvailable:false, multiple:false,
    folders:[{id:10,name:'First folder',parent:0,count:0,position:0},{id:20,name:'Second folder',parent:0,count:0,position:1}],
  });
  render(<I18nProvider><MediaView/></I18nProvider>);
  return (id:number) => within(screen.getByRole('table')).findByRole('button',{name:new RegExp('Photo-'+id+'[.]png')});
}

it('only moves the newly selected batch on a second folder drop from All media', async () => {
  const row = renderMediaLibrary();
  async function dropBatch(first:number, second:number, folder:string) {
    const firstRow = await row(first);
    fireEvent.click(firstRow);
    fireEvent.click(await row(second));
    const data = new Map<string,string>();
    const dataTransfer = { types:[MEDIA_DRAG_TYPE], setData:(key:string,value:string)=>data.set(key,value), getData:(key:string)=>data.get(key)??'' };
    fireEvent.dragStart(firstRow,{dataTransfer});
    const destination = await screen.findByRole('button',{name:new RegExp('^'+folder)});
    fireEvent.drop(destination.parentElement!,{dataTransfer});
  }
  await row(1);
  fireEvent.click(screen.getByRole('button',{name:'Bulk select'}));
  await dropBatch(1,2,'First folder');
  await waitFor(()=>expect(mediaFolders).toHaveBeenCalledWith('pixflow',expect.objectContaining({action:'assign',id:10,attachmentIds:[1,2]})));
  await dropBatch(3,4,'Second folder');
  await waitFor(()=>expect(mediaFolders).toHaveBeenCalledWith('pixflow',expect.objectContaining({action:'assign',id:20,attachmentIds:[3,4]})));
  expect((await row(1)).getAttribute('aria-pressed')).toBe('false');
});

it('uses Shift-click to add and remove ranges in bulk mode', async () => {
  const row = renderMediaLibrary();
  const first = await row(1);
  fireEvent.click(screen.getByRole('button',{name:'Bulk select'}));
  const second = await row(2);
  const third = await row(3);
  const fourth = await row(4);
  fireEvent.click(first);
  fireEvent.click(second);
  fireEvent.click(fourth,{shiftKey:true});
  for (const button of [first,second,third,fourth]) {
    expect(button.getAttribute('aria-pressed')).toBe('true');
  }
  fireEvent.click(third,{shiftKey:true});
  expect(third.getAttribute('aria-pressed')).toBe('true');
  expect(fourth.getAttribute('aria-pressed')).toBe('false');

  fireEvent.click(second,{shiftKey:true});
  expect(first.getAttribute('aria-pressed')).toBe('true');
  expect(second.getAttribute('aria-pressed')).toBe('true');
  expect(third.getAttribute('aria-pressed')).toBe('false');

  fireEvent.click(fourth,{shiftKey:true});
  fireEvent.keyUp(window,{key:'Shift'});
  fireEvent.click(fourth,{shiftKey:true});
  expect(first.getAttribute('aria-pressed')).toBe('true');
  for (const button of [second,third,fourth]) {
    expect(button.getAttribute('aria-pressed')).toBe('false');
  }
});
