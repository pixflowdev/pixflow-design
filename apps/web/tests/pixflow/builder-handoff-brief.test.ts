import { describe, expect, it } from 'vitest';
import { buildWorkspaceHandoffBrief } from '../../src/pixflow/builder-handoff-brief';

describe('reviewable builder brief', () => {
  it('preserves the latest request and earlier decisions without collecting tool output', () => {
    const result = buildWorkspaceHandoffBrief('Bakery', [
      {id:'1',role:'user',content:'Warm colours, no pricing table.'},
      {id:'2',role:'assistant',content:'Use three service cards.',events:[{kind:'text',text:'private tool log'}]},
      {id:'3',role:'user',content:'Build this in Gutenberg.'},
    ], [], 'project');
    expect(result.brief).toContain('Latest user request:\nBuild this in Gutenberg.');
    expect(result.brief).toContain('Warm colours, no pricing table.');
    expect(result.brief).not.toContain('private tool log');
    expect(result.brief).toContain('do not publish');
    expect(result.brief).toContain("change an existing page's publication status");
  });
  it('keeps attachment owners and excludes traversal paths and arbitrary fallback files', () => {
    const result = buildWorkspaceHandoffBrief('Page', [{id:'1',role:'user',content:'Use this photo',attachments:[
      {projectId:'uploads',path:'photo.png',name:'photo.png',kind:'image'},
      {path:'../private.txt',name:'private.txt',kind:'file'},
    ]}], [], 'project');
    expect(result.assets).toEqual([{projectId:'uploads',path:'photo.png',name:'photo.png'}]);
  });
  it('does not mutate messages or include unbounded history', () => {
    const messages = Array.from({length:20}, (_,i) => ({id:String(i),role:'user' as const,content:`request-${i} `+'x'.repeat(7000)}));
    const before = JSON.stringify(messages);
    const result = buildWorkspaceHandoffBrief('Page', messages, [], 'project');
    expect(result.brief.length).toBeLessThan(23000);
    expect(result.brief).not.toContain('request-0 ');
    expect(JSON.stringify(messages)).toBe(before);
  });
  it('does not attach removed historical outputs or retired package manifests',()=>{
    const file=(name:string)=>({name,type:'file' as const,size:1,mtime:0,kind:'image' as const,mime:'image/png'});
    const result=buildWorkspaceHandoffBrief('Studio',[{id:'1',role:'assistant',content:'Created the image.',producedFiles:[file('plugin-assets/od-default/plugin-manifest.json'),file('deleted.png'),file('hero.png')]}],[file('hero.png')],'project');
    expect(result.assets).toEqual([{projectId:'project',path:'hero.png',name:'hero.png',mime:'image/png'}]);
  });
  it('automatically fits multilingual context within the transport limit',()=>{
    const messages=Array.from({length:6},(_,i)=>({id:String(i),role:'user' as const,content:'建築'.repeat(5000)}));
    const result=buildWorkspaceHandoffBrief('建築',messages,[],'project');
    expect(new TextEncoder().encode(result.brief).byteLength).toBeLessThan(65536);
    expect(result.brief).toContain('Keep new pages as drafts');
    expect(result.brief).not.toContain('\uFFFD');
  });
});
