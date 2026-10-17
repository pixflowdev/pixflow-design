// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BuilderDestinationControl } from '../../src/components/BuilderDestinationControl';
import { listBuilderDestinations, prepareBuilderDestination } from '../../src/pixflow/builder-destinations';
import { en } from '../../src/i18n/locales/en';
import type { PixflowBuilderDestinationList, PixflowBuilderDestinationResult } from '@open-design/contracts';
vi.mock('../../src/i18n', () => ({ useT: () => (key: keyof typeof en, vars?: Record<string,string>) => Object.entries(vars ?? {}).reduce((text,[name,value]) => text.replace(`{${name}}`,value),en[key]) }));
vi.mock('../../src/pixflow/builder-destinations', async importOriginal => ({ ...await importOriginal<object>(), listBuilderDestinations: vi.fn(), prepareBuilderDestination: vi.fn() }));
const catalogue: PixflowBuilderDestinationList = { builders:[{id:'gutenberg',label:'Gutenberg',available:true},{id:'bricks',label:'Bricks',available:true}],pages:[{postId:5,title:'Saved page',status:'publish',builder:'gutenberg',editorUrl:'/wp-admin/post.php?post=5&action=edit'}],hasMore:false };
const response: PixflowBuilderDestinationResult = {destination:{postId:9,title:'New page',status:'draft',builder:'gutenberg',editorUrl:'/wp-admin/post.php?post=9&action=edit'},created:true,reused:false};
const props = {defaultPageTitle:'New page',chatId:'chat-a',open:true,onOpenChange:vi.fn(),onDestination:vi.fn()};
beforeEach(()=>{
  vi.clearAllMocks();
  vi.stubGlobal('open',vi.fn(()=>null));
  vi.mocked(listBuilderDestinations).mockResolvedValue(catalogue);
  vi.mocked(prepareBuilderDestination).mockResolvedValue(response);
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function chooseEditor(name='Gutenberg') {
  const select=await screen.findByRole('combobox',{name:/^Editor:/});
  await waitFor(()=>expect(select.hasAttribute('disabled')).toBe(false));
  fireEvent.click(select);
  fireEvent.click(screen.getByRole('option',{name}));
}
async function chooseDraft() {
  await chooseEditor();
  await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());
}
function openPagePicker() {
  const picker=screen.getAllByRole('button',{name:'Existing page'}).find(button=>button.getAttribute('aria-haspopup')==='dialog');
  expect(picker).toBeTruthy();
  fireEvent.click(picker!);
}
async function chooseExistingPage() {
  fireEvent.click(screen.getByRole('button',{name:'Existing page'}));
  openPagePicker();
  fireEvent.click(await screen.findByRole('button',{name:'Saved page'}));
}
describe('Builder destination selection',()=>{
  it('automatically opens a fresh agent receipt once and preserves blocked-popup recovery',async()=>{
    const autoProps={...props,autoOpenReceiptId:'fresh-receipt',destination:response.destination,buildEditorUrl:'/wp-admin/post.php?post=9&action=edit&pixflow_handoff=fresh-receipt',buildStatus:'connecting' as const,onBuild:vi.fn()};
    const view=render(<BuilderDestinationControl {...autoProps}/>);
    await screen.findByText('Your browser blocked the new tab. Use Open editor to continue.');
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(props.onOpenChange).toHaveBeenCalledWith(true);
    expect(prepareBuilderDestination).not.toHaveBeenCalled();
    expect(autoProps.onBuild).not.toHaveBeenCalled();
    view.rerender(<BuilderDestinationControl {...autoProps} destination={{...response.destination}}/>);
    expect(window.open).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('link',{name:'Open editor'}));
    expect(window.open).toHaveBeenCalledTimes(2);
    expect(prepareBuilderDestination).not.toHaveBeenCalled();
  });
  it('does not auto-open an unsafe agent destination',()=>{
    render(<BuilderDestinationControl {...props} autoOpenReceiptId="fresh-receipt" destination={response.destination} buildEditorUrl="https://foreign.example/editor" buildStatus="connecting"/>);
    expect(window.open).not.toHaveBeenCalled();
  });
  it('creates only an empty draft through the shared service and retains an editor link if popups are blocked',async()=>{
    render(<BuilderDestinationControl {...props}/>);await chooseDraft();
    fireEvent.click(screen.getByRole('button',{name:'Handoff'}));
    await screen.findByText('Your browser blocked the new tab. Use Open editor to continue.');
    expect(prepareBuilderDestination).toHaveBeenCalledWith({action:'create',builder:'gutenberg',title:'New page',requestId:expect.any(String)});
    expect(props.onDestination).toHaveBeenCalledWith(response.destination);
    expect(screen.getByRole('link',{name:'Open editor'}).getAttribute('href')).toContain('post=9');
    expect(screen.queryByRole('button',{name:'Handoff'})).toBeNull();
  });
  it('prevents duplicate clicks and reuses the idempotency key after an uncertain failure',async()=>{
    let reject!: (reason:Error)=>void;
    vi.mocked(prepareBuilderDestination).mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;}));
    render(<BuilderDestinationControl {...props}/>);await chooseDraft();
    const button=screen.getByRole('button',{name:'Handoff'});fireEvent.click(button);fireEvent.click(button);
    expect(prepareBuilderDestination).toHaveBeenCalledTimes(1);
    reject(new Error('Connection interrupted'));
    await screen.findByText('Connection interrupted');
    fireEvent.click(screen.getByRole('button',{name:'Handoff'}));
    await screen.findByRole('link',{name:'Open editor'});
    expect(vi.mocked(prepareBuilderDestination).mock.calls[1]![0]).toEqual(vi.mocked(prepareBuilderDestination).mock.calls[0]![0]);
  });
  it('opens an existing page without creating or changing content',async()=>{
    render(<BuilderDestinationControl {...props}/>);await chooseDraft();
    await chooseExistingPage();
    fireEvent.click(screen.getByRole('button',{name:'Handoff'}));
    await screen.findByRole('link',{name:'Open editor'});
    expect(prepareBuilderDestination).toHaveBeenCalledWith({action:'open',builder:'gutenberg',postId:5});
  });
  it('cancels without creating a page and disables unavailable builders',async()=>{
    vi.mocked(listBuilderDestinations).mockResolvedValue({...catalogue,builders:[catalogue.builders[0]!,{id:'bricks',label:'Bricks',available:false,reason:'Pro required'}]});
    render(<BuilderDestinationControl {...props}/>);
    await waitFor(()=>expect(screen.getByRole('combobox',{name:/^Editor:/}).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('combobox',{name:/^Editor:/}));
    expect(screen.getByRole('option',{name:/Bricks.*Pro required/}).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'Close'}));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(prepareBuilderDestination).not.toHaveBeenCalled();
  });
  it('does not attach a late response to a different chat',async()=>{
    let resolve!: (value:PixflowBuilderDestinationResult)=>void;
    vi.mocked(prepareBuilderDestination).mockImplementation(()=>new Promise(done=>{resolve=done;}));
    const blank={opener:{},closed:false,location:{href:'about:blank',replace:vi.fn()},close:vi.fn(),focus:vi.fn()};vi.mocked(window.open).mockReturnValue(blank as unknown as Window);
    const view=render(<BuilderDestinationControl {...props}/>);await chooseDraft();fireEvent.click(screen.getByRole('button',{name:'Handoff'}));
    view.rerender(<BuilderDestinationControl {...props} chatId="chat-b"/>);
    resolve(response);await waitFor(()=>expect(screen.getByRole('combobox',{name:/^Editor:/})).toBeTruthy());
    expect(props.onDestination).not.toHaveBeenCalled();expect(blank.close).toHaveBeenCalled();expect(blank.location.replace).not.toHaveBeenCalled();
  });
  it('navigates a reserved editor tab only after a valid result and strips its opener',async()=>{
    const blank={opener:{},closed:false,location:{href:'about:blank',replace:vi.fn()},close:vi.fn(),focus:vi.fn()};vi.mocked(window.open).mockReturnValue(blank as unknown as Window);
    render(<BuilderDestinationControl {...props}/>);await chooseDraft();fireEvent.click(screen.getByRole('button',{name:'Handoff'}));
    await waitFor(()=>expect(blank.location.replace).toHaveBeenCalledWith(expect.stringContaining('post=9')));expect(blank.opener).toBeNull();
  });
  it('rejects foreign editor URLs and never opens or attaches them',async()=>{
    vi.mocked(prepareBuilderDestination).mockResolvedValue({...response,destination:{...response.destination,editorUrl:'https://evil.test/wp-admin/'}});
    render(<BuilderDestinationControl {...props}/>);await chooseDraft();fireEvent.click(screen.getByRole('button',{name:'Handoff'}));
    await screen.findByText('The editor link is not a valid address on this site.');expect(props.onDestination).not.toHaveBeenCalled();
  });
  it('keeps selection disabled while a run is active',async()=>{
    render(<BuilderDestinationControl {...props} disabled/>);
    expect((await screen.findByRole('combobox',{name:/^Editor:/})).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Wait for the current run to finish before changing the destination.')).toBeTruthy();
  });
  it('reopens the selector from any shared trigger after success and uses a new key for a new draft',async()=>{
    const view=render(<BuilderDestinationControl {...props}/>);await chooseDraft();fireEvent.click(screen.getByRole('button',{name:'Handoff'}));
    await screen.findByRole('link',{name:'Open editor'});
    view.rerender(<BuilderDestinationControl {...props} open={false}/>);
    view.rerender(<BuilderDestinationControl {...props} open/>);
    await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());
    expect(screen.getByRole('combobox',{name:/^Editor:/})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Handoff'}));await screen.findByRole('link',{name:'Open editor'});
    const calls=vi.mocked(prepareBuilderDestination).mock.calls;
    expect(calls[1]![0]).not.toEqual(calls[0]![0]);
  });
  it('does not request page listings when selecting a new-draft builder',async()=>{
    render(<BuilderDestinationControl {...props}/>);await chooseDraft();
    expect(listBuilderDestinations).toHaveBeenCalledTimes(1);
    expect(listBuilderDestinations).toHaveBeenLastCalledWith(undefined,'',expect.any(AbortSignal));
    expect(screen.getByRole('button',{name:'Handoff'}).hasAttribute('disabled')).toBe(false);
    await chooseEditor('Bricks');
    expect(listBuilderDestinations).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button',{name:'Handoff'}).hasAttribute('disabled')).toBe(false);
  });
  it('debounces existing-page searches and hides stale results while typing',async()=>{
    render(<BuilderDestinationControl {...props}/>);await chooseDraft();fireEvent.click(screen.getByRole('button',{name:'Existing page'}));
    openPagePicker();
    await screen.findByRole('button',{name:'Saved page'});
    const before=vi.mocked(listBuilderDestinations).mock.calls.length;
    const input=screen.getByRole('textbox',{name:'Search pages…'});
    fireEvent.change(input,{target:{value:'Tea'}});fireEvent.change(input,{target:{value:'Tea shop'}});
    expect(listBuilderDestinations).toHaveBeenCalledTimes(before);
    expect(screen.queryByRole('button',{name:'Saved page'})).toBeNull();
    await waitFor(()=>expect(listBuilderDestinations).toHaveBeenLastCalledWith('gutenberg','Tea shop',expect.any(AbortSignal)));
    expect(listBuilderDestinations).toHaveBeenCalledTimes(before+1);
    await screen.findByRole('button',{name:'Saved page'});
  });
  it('recovers from a failed catalogue request',async()=>{
    vi.mocked(listBuilderDestinations).mockRejectedValueOnce(new Error('Offline'));
    render(<BuilderDestinationControl {...props}/>);await screen.findByText('Offline');fireEvent.click(screen.getByRole('button',{name:'Try again'}));
    await chooseEditor();
  });
});




describe('Automatic builder handoff',()=>{
  const buildResult={destination:response.destination,editorUrl:'/wp-admin/post.php?post=9&action=edit&pixflow_handoff=receipt-1&pixflow_handoff_tab=tab-1'};
  it('only asks for destination and sends the automatically prepared brief on Handoff',async()=>{
    const onBuild=vi.fn().mockResolvedValue(buildResult);
    render(<BuilderDestinationControl {...props} buildBrief="Preserve the footer. Build a tea shop page." onBuild={onBuild}/>);
    await chooseDraft();
    expect(screen.queryByRole('textbox',{name:'Build brief'})).toBeNull();
    expect(screen.queryByRole('textbox',{name:'Page title'})).toBeNull();
    expect(onBuild).not.toHaveBeenCalled();expect(prepareBuilderDestination).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Handoff'}));
    await screen.findByRole('link',{name:'Open editor'});
    expect(onBuild).toHaveBeenCalledWith({action:'create',builder:'gutenberg',title:'New page',requestId:expect.any(String)},'Preserve the footer. Build a tea shop page.',expect.any(String));
    expect(prepareBuilderDestination).not.toHaveBeenCalled();
    expect(screen.getByRole('link',{name:'Open editor'}).getAttribute('href')).toContain('pixflow_handoff=receipt-1');
  });
  it('supplies a localized draft title when the chat has no name',async()=>{
    const onBuild=vi.fn().mockResolvedValue(buildResult);
    render(<BuilderDestinationControl {...props} defaultPageTitle=" " buildBrief="Build a tea shop" onBuild={onBuild}/>);await chooseDraft();
    fireEvent.click(screen.getByRole('button',{name:'Handoff'}));await screen.findByRole('link',{name:'Open editor'});
    expect(onBuild).toHaveBeenCalledWith(expect.objectContaining({title:'Untitled page'}),'Build a tea shop',expect.any(String));
  });
  it('uses the same single start action for an existing page without asking for a brief or title',async()=>{
    const onBuild=vi.fn().mockResolvedValue(buildResult);
    render(<BuilderDestinationControl {...props} buildBrief="Use this chat to update the selected page" onBuild={onBuild}/>);await chooseDraft();
    await chooseExistingPage();
    expect(screen.queryByRole('textbox',{name:'Build brief'})).toBeNull();expect(screen.queryByRole('textbox',{name:'Page title'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Handoff'}));await screen.findByRole('link',{name:'Open editor'});
    expect(onBuild).toHaveBeenCalledWith({action:'open',builder:'gutenberg',postId:5},'Use this chat to update the selected page',expect.any(String));
  });
  it('does not start a build for a blank brief or cancellation',async()=>{
    const onBuild=vi.fn();render(<BuilderDestinationControl {...props} buildBrief=" " onBuild={onBuild}/>);await chooseDraft();
    const button=screen.getByRole('button',{name:'Handoff'});expect(button.hasAttribute('disabled')).toBe(true);fireEvent.click(button);
    fireEvent.click(screen.getByRole('button',{name:'Close'}));expect(onBuild).not.toHaveBeenCalled();
  });
  it('retains the request key on an uncertain handoff failure and never double-submits',async()=>{
    let reject!:(error:Error)=>void;
    const onBuild=vi.fn().mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;})).mockResolvedValue(buildResult);
    render(<BuilderDestinationControl {...props} buildBrief="Build a tea shop page" onBuild={onBuild}/>);await chooseDraft();
    const button=screen.getByRole('button',{name:'Handoff'});fireEvent.click(button);fireEvent.click(button);expect(onBuild).toHaveBeenCalledTimes(1);
    reject(new Error('Status could not be confirmed'));await screen.findByText('Status could not be confirmed');
    fireEvent.click(screen.getByRole('button',{name:'Handoff'}));await screen.findByRole('link',{name:'Open editor'});
    expect(onBuild.mock.calls[1]).toEqual(onBuild.mock.calls[0]);
  });
  it('reopens an active receipt without exposing another creation button',async()=>{
    const onBuild=vi.fn();
    const extra={buildBrief:'New chat content',onBuild,buildStatus:'connecting' as const,buildReceiptBrief:'The persisted reviewed brief',buildEditorUrl:buildResult.editorUrl,destination:response.destination};
    const view=render(<BuilderDestinationControl {...props} {...extra} open={false}/>);
    expect(screen.getByRole('status').textContent).toBe('Waiting for the editor…');
    view.rerender(<BuilderDestinationControl {...props} {...extra} open/>);
    expect(screen.queryByText('The persisted reviewed brief')).toBeNull();
    expect(screen.getByRole('link',{name:'Open editor'})).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Handoff'})).toBeNull();expect(screen.queryByRole('textbox',{name:'Build brief'})).toBeNull();
    expect(onBuild).not.toHaveBeenCalled();
  });
  it.each(['uncertain', 'delayed'] as const)('reconnects a %s handoff through the same receipt callback, with no fresh create or build submission',async buildStatus=>{
    const onBuild=vi.fn(),onRetryBuild=vi.fn().mockResolvedValue(buildResult);
    const blank={opener:{},closed:false,location:{href:'about:blank',replace:vi.fn()},close:vi.fn(),focus:vi.fn()};vi.mocked(window.open).mockReturnValue(blank as unknown as Window);
    render(<BuilderDestinationControl {...props} destination={response.destination} buildEditorUrl={buildResult.editorUrl} buildReceiptBrief="Keep existing content" onBuild={onBuild} buildStatus={buildStatus} onRetryBuild={onRetryBuild}/>);
    if (buildStatus === 'delayed') {
      expect(screen.getAllByText('Waiting for the editor…')).toHaveLength(2);
      expect(screen.queryByText('Build needs attention')).toBeNull();
    }
    fireEvent.click(screen.getByRole('button',{name:'Reconnect to this build'}));
    await waitFor(()=>expect(blank.location.replace).toHaveBeenCalledWith(expect.stringContaining('pixflow_handoff=receipt-1')));
    expect(onRetryBuild).toHaveBeenCalledTimes(1);expect(onBuild).not.toHaveBeenCalled();expect(prepareBuilderDestination).not.toHaveBeenCalled();
  });
  it('enforces the server byte limit for non-ASCII briefs before any page is created',async()=>{
    const onBuild=vi.fn();render(<BuilderDestinationControl {...props} buildBrief={'茶'.repeat(22000)} onBuild={onBuild}/>);await chooseDraft();
    expect(screen.getByRole('alert').textContent).toBe('Could not prepare this build: the chat context is too large.');
    expect(screen.getByRole('button',{name:'Handoff'}).hasAttribute('disabled')).toBe(true);
    expect(onBuild).not.toHaveBeenCalled();expect(prepareBuilderDestination).not.toHaveBeenCalled();
  });
  it('shows a question pause without presenting the agent turn as finished or offering another build',async()=>{
    render(<BuilderDestinationControl {...props} destination={response.destination} buildEditorUrl={buildResult.editorUrl} onBuild={vi.fn()} buildStatus="awaiting_input" onRetryBuild={vi.fn()}/>);
    expect(screen.getAllByText('Waiting for your answer')).toHaveLength(2);
    expect(screen.queryByText('Agent turn finished')).toBeNull();
    expect(screen.queryByRole('button',{name:'Prepare another build'})).toBeNull();
    expect(screen.queryByRole('button',{name:'Reconnect to this build'})).toBeNull();
    expect(screen.getByRole('link',{name:'Open editor'})).toBeTruthy();
  });
  it('focuses the original editor on Open editor and reconnect without reloading its active run',async()=>{
    const blank={opener:{},closed:false,name:'',location:{href:'about:blank',replace:vi.fn()},close:vi.fn(),focus:vi.fn()};
    vi.mocked(window.open).mockReturnValue(blank as unknown as Window);
    const onBuild=vi.fn().mockResolvedValue(buildResult),onRetryBuild=vi.fn().mockResolvedValue(buildResult);
    const view=render(<BuilderDestinationControl {...props} buildBrief="Build a tea shop" onBuild={onBuild} onRetryBuild={onRetryBuild}/>);
    await chooseDraft();fireEvent.click(screen.getByRole('button',{name:'Handoff'}));await screen.findByRole('link',{name:'Open editor'});
    expect(blank.name).toBe('pixflow-build-tab-1');expect(blank.location.replace).toHaveBeenCalledTimes(1);
    blank.location.href=buildResult.editorUrl;
    fireEvent.click(screen.getByRole('link',{name:'Open editor'}));
    expect(window.open).toHaveBeenCalledTimes(1);expect(blank.location.replace).toHaveBeenCalledTimes(1);
    view.rerender(<BuilderDestinationControl {...props} buildBrief="Build a tea shop" destination={response.destination} buildEditorUrl={buildResult.editorUrl} buildStatus="uncertain" onBuild={onBuild} onRetryBuild={onRetryBuild}/>);
    fireEvent.click(screen.getByRole('link',{name:'Open in Gutenberg'}));
    fireEvent.click(screen.getByRole('button',{name:'Reconnect to this build'}));await waitFor(()=>expect(onRetryBuild).toHaveBeenCalledOnce());
    await waitFor(()=>expect(screen.getByRole('button',{name:'Reconnect to this build'}).hasAttribute('disabled')).toBe(false));
    expect(window.open).toHaveBeenCalledTimes(1);expect(blank.location.replace).toHaveBeenCalledTimes(1);expect(blank.close).not.toHaveBeenCalled();expect(blank.focus.mock.calls.length).toBeGreaterThan(1);expect(onBuild).toHaveBeenCalledTimes(1);
  });
  it('recovers a named editor after remount without navigating the existing tab again',async()=>{
    const existing={opener:{},closed:false,name:'pixflow-build-tab-1',location:{href:buildResult.editorUrl,replace:vi.fn()},close:vi.fn(),focus:vi.fn()};
    vi.mocked(window.open).mockReturnValue(existing as unknown as Window);
    render(<BuilderDestinationControl {...props} destination={response.destination} buildEditorUrl={buildResult.editorUrl} buildStatus="building" onBuild={vi.fn()}/>);
    fireEvent.click(screen.getByRole('link',{name:'Open editor'}));
    expect(window.open).toHaveBeenCalledWith('','pixflow-build-tab-1');expect(existing.location.replace).not.toHaveBeenCalled();expect(existing.focus).toHaveBeenCalledOnce();expect(existing.opener).toBeNull();
  });
  it('shows completion without offering a duplicate retry',async()=>{
    render(<BuilderDestinationControl {...props} destination={response.destination} buildEditorUrl={buildResult.editorUrl} onBuild={vi.fn()} buildStatus="completed" onRetryBuild={vi.fn()}/>);
    expect(screen.getAllByText('Agent turn finished')).toHaveLength(2);expect(screen.queryByRole('button',{name:'Reconnect to this build'})).toBeNull();
  });
});



describe('Preparing a further build',()=>{
  it('only offers a new build when the parent confirms the receipt is terminal',async()=>{
    const view=render(<BuilderDestinationControl {...props} destination={response.destination} buildEditorUrl={response.destination.editorUrl} buildStatus="uncertain" onBuild={vi.fn()}/>);
    expect(screen.queryByRole('button',{name:'Prepare another build'})).toBeNull();
    const newBuild=vi.fn();
    view.rerender(<BuilderDestinationControl {...props} destination={response.destination} buildEditorUrl={response.destination.editorUrl} buildStatus="completed" onBuild={vi.fn()} onNewBuild={newBuild}/>);
    expect(screen.getByRole('button',{name:'Prepare another build'})).toBeTruthy();
    expect(newBuild).not.toHaveBeenCalled();
  });
  it('resets the old receipt and uses current chat context for another build without manual fields',async()=>{
    const onBuild=vi.fn(),onNewBuild=vi.fn();
    const source={...props,onBuild,onNewBuild,buildBrief:'Current chat instructions'};
    const view=render(<BuilderDestinationControl {...source} destination={response.destination} buildEditorUrl={response.destination.editorUrl} buildStatus="completed" buildReceiptBrief="Old accepted instructions"/>);
    fireEvent.click(screen.getByRole('button',{name:'Prepare another build'}));
    expect(onNewBuild).toHaveBeenCalledOnce();
    view.rerender(<BuilderDestinationControl {...source}/>);
    await chooseDraft();
    expect(screen.queryByRole('textbox',{name:'Build brief'})).toBeNull();
    expect(screen.queryByRole('textbox',{name:'Page title'})).toBeNull();
    expect(screen.queryByText('Old accepted instructions')).toBeNull();
    expect(screen.getByRole('button',{name:'Handoff'})).toBeTruthy();
    expect(onBuild).not.toHaveBeenCalled();expect(prepareBuilderDestination).not.toHaveBeenCalled();
  });
});




describe('Compact handoff popout',()=>{
  it('toggles from the header without a modal backdrop or manual fields',async()=>{
    const view=render(<BuilderDestinationControl {...props} open={false}/>);
    const trigger=screen.getByRole('button',{name:'Handoff to builder'});
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger);expect(props.onOpenChange).toHaveBeenLastCalledWith(true);
    view.rerender(<BuilderDestinationControl {...props} open/>);
    const panel=screen.getByRole('dialog',{name:'Handoff to builder'});
    expect(panel.getAttribute('aria-modal')).toBe('false');
    expect(panel.tagName).toBe('DIV');
    await chooseDraft();
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(trigger);expect(props.onOpenChange).toHaveBeenLastCalledWith(false);
    expect(prepareBuilderDestination).not.toHaveBeenCalled();
  });
  it('dismisses on outside press or Escape, but not an inside press',async()=>{
    render(<BuilderDestinationControl {...props}/>);await chooseDraft();
    const panel=screen.getByRole('dialog',{name:'Handoff to builder'});
    fireEvent.mouseDown(panel);expect(props.onOpenChange).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);expect(props.onOpenChange).toHaveBeenCalledWith(false);
    props.onOpenChange.mockClear();
    fireEvent.keyDown(panel,{key:'Escape'});expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(screen.getByRole('button',{name:'Handoff to builder'}));
    expect(prepareBuilderDestination).not.toHaveBeenCalled();
  });
  it('closes the nested page picker first and restores the selected page label',async()=>{
    render(<BuilderDestinationControl {...props}/>);await chooseDraft();
    fireEvent.click(screen.getByRole('button',{name:'Existing page'}));openPagePicker();
    await screen.findByRole('button',{name:'Saved page'});
    fireEvent.keyDown(screen.getByRole('textbox',{name:'Search pages…'}),{key:'Escape'});
    expect(screen.queryByRole('dialog',{name:'Existing page'})).toBeNull();
    expect(props.onOpenChange).not.toHaveBeenCalled();
    openPagePicker();fireEvent.click(await screen.findByRole('button',{name:'Saved page'}));
    expect(screen.queryByRole('dialog',{name:'Existing page'})).toBeNull();
    const picker=screen.getByRole('button',{name:'Saved page'});
    expect(picker.getAttribute('aria-expanded')).toBe('false');expect(document.activeElement).toBe(picker);
    expect(screen.getByRole('button',{name:'Handoff'}).hasAttribute('disabled')).toBe(false);
    fireEvent.keyDown(screen.getByRole('dialog',{name:'Handoff to builder'}),{key:'Escape'});
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
  it('clears the page selection on editor changes and submits only the newly selected destination',async()=>{
    render(<BuilderDestinationControl {...props}/>);await chooseDraft();await chooseExistingPage();
    vi.mocked(listBuilderDestinations).mockResolvedValue({...catalogue,pages:[{...catalogue.pages[0]!,postId:6,title:'Bricks page',builder:'bricks'}]});
    await chooseEditor('Bricks');
    expect(screen.getByRole('button',{name:'Handoff'}).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button',{name:'Saved page'})).toBeNull();
    openPagePicker();fireEvent.click(await screen.findByRole('button',{name:'Bricks page'}));
    fireEvent.click(screen.getByRole('button',{name:'Handoff'}));await screen.findByRole('link',{name:'Open editor'});
    expect(prepareBuilderDestination).toHaveBeenCalledWith({action:'open',builder:'bricks',postId:6});
  });
  it('keeps the popout open when Escape dismisses the editor list',async()=>{
    render(<BuilderDestinationControl {...props}/>);await chooseDraft();
    const select=screen.getByRole('combobox',{name:'Editor: Gutenberg'});
    fireEvent.click(select);expect(screen.getByRole('listbox',{name:'Editor'})).toBeTruthy();
    fireEvent.keyDown(select,{key:'Escape'});
    expect(screen.queryByRole('listbox',{name:'Editor'})).toBeNull();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });
  it('does not dismiss or change the selection while a handoff is pending',async()=>{
    vi.mocked(prepareBuilderDestination).mockImplementation(()=>new Promise(()=>{}));
    render(<BuilderDestinationControl {...props}/>);await chooseDraft();
    fireEvent.click(screen.getByRole('button',{name:'Handoff'}));
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(screen.getByRole('dialog',{name:'Handoff to builder'}),{key:'Escape'});
    fireEvent.click(screen.getByRole('button',{name:'Close'}));
    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox',{name:'Editor: Gutenberg'}).hasAttribute('disabled')).toBe(true);
    expect(prepareBuilderDestination).toHaveBeenCalledOnce();
  });
});

it.each([['etch','Etch','/?etch=magic&post_id=9'],['elementor','Elementor','/wp-admin/post.php?post=9&action=elementor']] as const)('hands off to %s with the shared compact flow and correct result label',async(builder,label,editorUrl)=>{
  vi.mocked(listBuilderDestinations).mockResolvedValue({...catalogue,builders:[...catalogue.builders,{id:builder,label,available:true}]});
  const destination={...response.destination,builder,editorUrl};
  const onBuild=vi.fn(async()=>({destination,editorUrl}));
  const view=render(<BuilderDestinationControl {...props} buildBrief="Create a calm studio page" onBuild={onBuild}/>);
  await chooseEditor(label);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Handoff'}).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Handoff'}));
  await screen.findByRole('link',{name:'Open editor'});
  expect(onBuild).toHaveBeenCalledWith({action:'create',builder,title:'New page',requestId:expect.any(String)},'Create a calm studio page',expect.any(String));
  expect(screen.getByText(label)).toBeTruthy();
  view.rerender(<BuilderDestinationControl {...props} destination={destination} buildBrief="Create a calm studio page" onBuild={onBuild} buildStatus="completed" buildEditorUrl={editorUrl}/>);
  expect(screen.getByRole('link',{name:`Open in ${label}`})).toBeTruthy();
});
