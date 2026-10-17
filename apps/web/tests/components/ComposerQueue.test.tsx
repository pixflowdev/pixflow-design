// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ComposerQueue } from '../../src/components/ComposerQueue';
import { useComposerQueue } from '../../src/components/composer-queue';

afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });
it('shows a rejected steering explanation beside the retained message', () => {
  sessionStorage.setItem('queue-ui',JSON.stringify({paused:true,items:[{id:'rejected-steer',prompt:'Keep this request',attachments:[],comments:[],state:'queued',message:'The run is still starting. Keep this message queued.'}]}));
  render(<Harness />);
  expect(screen.getByRole('status').textContent).toContain('The run is still starting');
  expect(screen.getByRole('button',{name:'Steer'})).toBeTruthy();
});
function Harness({ canSteer = true }: { canSteer?: boolean }) {
  const queue = useComposerQueue({ key: 'queue-ui', streaming: true, disabled: false, send: vi.fn() });
  return <div style={{ '--composer-surface': '#333333' } as React.CSSProperties}>
    <button onClick={() => queue.add('A queued request', [], [])}>Add</button>
    <ComposerQueue queue={queue} canSteer={canSteer} onEdit={item => { queue.takeForEditing(item.id); }} />
  </div>;
}
it('offers compact row actions without a queue header or pause control', () => {
  render(<Harness />);
  fireEvent.click(screen.getByText('Add'));
  expect(screen.queryByText('Queue paused')).toBeNull();
  expect(screen.getByRole('button', { name: 'Steer' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Queued message actions' })).toBeNull();
  const actions = screen.getByRole('button', { name: 'Steer' }).parentElement!;
  expect(Array.from(actions.querySelectorAll('button')).map(button => button.getAttribute('aria-label') || button.textContent)).toEqual(['Steer', 'Delete queued message', 'Edit queued message']);
  expect(screen.queryByRole('menu')).toBeNull();
});
it('hands editing to the main composer without showing a separate editor', () => {
  render(<Harness />);
  fireEvent.click(screen.getByText('Add'));
  fireEvent.click(screen.getByRole('button', { name: 'Edit queued message' }));
  expect(screen.queryByRole('textbox', { name: 'Edit queued message' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Queued messages' })).toBeNull();
});

it('hides steering while retaining queue controls for unsupported providers', () => {
  render(<Harness canSteer={false} />);
  fireEvent.click(screen.getByText('Add'));
  expect(screen.queryByRole('button', { name: 'Steer' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Edit queued message' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Delete queued message' })).toBeTruthy();
});

it('shows grips for multiple pending messages and persists drag and keyboard order', () => {
  sessionStorage.setItem('queue-ui',JSON.stringify({paused:false,items:['One','Two','Three'].map(id=>({id,prompt:id,attachments:[],comments:[],state:'queued'}))}));
  render(<Harness />);
  const handles=screen.getAllByRole('button',{name:'Reorder queued message'});
  expect(handles).toHaveLength(3);
  expect(handles[0]!.querySelectorAll('circle')).toHaveLength(6);
  fireEvent.dragStart(handles[2]!);
  fireEvent.drop(handles[0]!.closest('li')!);
  expect(JSON.parse(sessionStorage.getItem('queue-ui')!).items.map((item:{id:string})=>item.id)).toEqual(['Three','One','Two']);
  fireEvent.keyDown(screen.getAllByRole('button',{name:'Reorder queued message'})[0]!,{key:'ArrowDown'});
  expect(JSON.parse(sessionStorage.getItem('queue-ui')!).items.map((item:{id:string})=>item.id)).toEqual(['One','Three','Two']);
});
it('locks reorder while any message is sending or delivery is uncertain', () => {
  sessionStorage.setItem('queue-ui',JSON.stringify({paused:false,items:['sending','queued'].map((state,index)=>({id:String(index),prompt:state,attachments:[],comments:[],state}))}));
  render(<Harness />);
  expect(screen.queryByRole('button',{name:'Reorder queued message'})).toBeNull();
});

it('moves the dragged row with the pointer and makes room without committing until drop', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  sessionStorage.setItem('queue-ui',JSON.stringify({paused:false,items:['One','Two','Three'].map(id=>({id,prompt:id,attachments:[],comments:[],state:'queued'}))}));
  render(<Harness />);
  const handles = screen.getAllByRole('button',{name:'Reorder queued message'});
  const rows = handles.map(handle => handle.closest('li')!);
  rows.forEach((row,index) => { row.getBoundingClientRect = () => ({top:index*48,height:40}) as DOMRect; });
  Object.assign(handles[2]!,{setPointerCapture:vi.fn(),hasPointerCapture:()=>true,releasePointerCapture:vi.fn()});
  fireEvent.pointerDown(handles[2]!,{button:0,clientX:10,clientY:116});
  fireEvent.pointerMove(handles[2]!,{clientX:10,clientY:20});
  expect(rows[2]!.style.transform).toBe('translateY(-96px)');
  expect(rows[0]!.style.transform).toBe('translateY(48px)');
  expect(rows[1]!.style.transform).toBe('translateY(48px)');
  expect(JSON.parse(sessionStorage.getItem('queue-ui')!).items.map((item:{id:string})=>item.id)).toEqual(['One','Two','Three']);
  fireEvent.pointerUp(handles[2]!,{clientX:10,clientY:20});
  expect(JSON.parse(sessionStorage.getItem('queue-ui')!).items.map((item:{id:string})=>item.id)).toEqual(['Three','One','Two']);
  expect(rows[2]!.style.transform).toBe('');
});
