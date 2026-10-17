// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { PageAnnotationControl } from '../../src/pixflow/annotation-contribution';
import { annotationAvailable, AnnotationUnavailableError, containsAnnotations, requireAnnotations } from '../../src/pixflow/annotation-availability';
import { formatAnnotationDraft } from '../../src/pixflow/annotation-draft';
import { pageAnnotationParts, type PageAnnotation } from '../../src/pixflow/page-annotation';
import { useComposerQueue } from '../../src/components/composer-queue';

vi.mock('../../src/pixflow/wordpress-context', () => ({ getPixflowRestConfig: () => ({restBaseUrl: 'https://site.test/wp-json/pixflow-design/v1', restNonce: 'test-nonce'}) }));
const host = window as unknown as { PixflowAnnotationsFactory?: () => { PageAnnotationControl: () => React.ReactNode } };
const note: PageAnnotation = { comment: 'Make this blue', target: {url:'https://site.test/', pageTitle:'Home', selector:'#heading', label:'Heading', tag:'h1', text:'Hello', classes:[], viewport:{width:100,height:100}} };
beforeEach(() => { sessionStorage.clear(); delete host.PixflowAnnotationsFactory; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete host.PixflowAnnotationsFactory; });
it('Free has no authoring control and reads historical batches without Pro', () => {
  render(<PageAnnotationControl onAdd={vi.fn()} onOpenSettings={vi.fn()} disabled={false} streaming={false}/>);
  expect(screen.queryByRole('button')).toBeNull();
  expect(pageAnnotationParts(formatAnnotationDraft([note]))).toEqual([note]);
  expect(containsAnnotations('Normal text')).toBe(false);
  expect(containsAnnotations(formatAnnotationDraft([note]))).toBe(true);
});
it('mounts an optional Pro contribution without importing its implementation', () => {
  host.PixflowAnnotationsFactory = () => ({PageAnnotationControl: () => <button>Annotate page</button>});
  render(<PageAnnotationControl onAdd={vi.fn()} onOpenSettings={vi.fn()} disabled={false} streaming={false}/>);
  expect(screen.getByRole('button', {name:'Annotate page'})).toBeTruthy();
});
it('checks the current site on every operation and recovers after Pro reactivation', async () => {
  host.PixflowAnnotationsFactory = () => ({PageAnnotationControl: () => null});
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}',{status:403})).mockResolvedValue(new Response('{"available":true}'));
  vi.stubGlobal('fetch', fetcher);
  await expect(requireAnnotations()).rejects.toBeInstanceOf(AnnotationUnavailableError);
  await expect(requireAnnotations()).resolves.toBeUndefined();
  expect(annotationAvailable()).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({method:'POST',cache:'no-store',headers:{'X-WP-Nonce':'test-nonce'}});
});
it('retains a rejected queued batch and its screenshots, and resumes exactly once', async () => {
  const prompt = formatAnnotationDraft([note]);
  const files = [{path:'saved.png',name:'saved.png',kind:'image' as const,annotationScreenshot:true}];
  const send = vi.fn().mockRejectedValueOnce(new AnnotationUnavailableError()).mockResolvedValue(undefined);
  const {result, rerender} = renderHook(({streaming}) => useComposerQueue({key:'annotations',streaming,disabled:false,send}),{initialProps:{streaming:true}});
  act(() => { result.current.add(prompt,files,[]); });
  rerender({streaming:false});
  await waitFor(() => expect(result.current.paused).toBe(true));
  expect(result.current.items[0]).toMatchObject({prompt, attachments:files,state:'queued',message:expect.stringContaining('Pro')});
  act(() => { result.current.resume(); });
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(send).toHaveBeenLastCalledWith(prompt,files,[],undefined);
});
