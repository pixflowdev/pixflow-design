// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {decodeWorkspaceRouteHash,encodeWorkspaceRouteHash,migrateWorkspaceRouteHash} from '../../src/pixflow/workspace-route-hash';
afterEach(()=>window.history.replaceState(null,'','/'));
it.each(['/projects/a/conversations/b','/projects/日本語/files/a b.png','/','/onboarding'])('round trips %s using a valid selector',path=>{
 const hash=encodeWorkspaceRouteHash(path);expect(hash).toMatch(/^#pixflow-route-[A-Za-z0-9_-]+$/);
 expect(()=>document.querySelector(hash)).not.toThrow();expect(decodeWorkspaceRouteHash(hash)).toBe(path);
});
it('preserves old bookmarks, host query parameters and history state',()=>{
 window.history.replaceState({keep:true},'','/wp-admin/?page=tools#pixflow=%2Fprojects%2Fa');
 migrateWorkspaceRouteHash();expect(decodeWorkspaceRouteHash(window.location.hash)).toBe('/projects/a');
 expect(window.location.search).toBe('?page=tools');expect(window.history.state).toEqual({keep:true});
 expect(()=>document.querySelector(window.location.hash)).not.toThrow();
});
it('leaves native WordPress anchors alone',()=>{
 window.history.replaceState(null,'','/wp-admin/#wpbody-content');migrateWorkspaceRouteHash();
 expect(window.location.hash).toBe('#wpbody-content');expect(decodeWorkspaceRouteHash(window.location.hash)).toBeNull();
});
it('handles malformed old bookmarks without throwing',()=>expect(decodeWorkspaceRouteHash('#pixflow=%broken')).toBe('/'));
