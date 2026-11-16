import { describe, it, expect, vi } from 'vitest';
import type { Page, Route } from 'playwright-core';
import { scopeSavedPreviewRequests } from '../../src/pixflow/browser-screenshot.js';

describe('saved preview request isolation', () => {
  it('attaches a grant only to the exact GET and never follows a redirect with it', async () => {
    let handler!: (route: Route) => Promise<unknown>;
    const frame = {};
    const page = {mainFrame:()=>frame,route:vi.fn(async (_pattern, callback)=>{handler=callback;})} as unknown as Page;
    const token='a'.repeat(64), url='https://site.example/?page_id=9&preview=true';
    await scopeSavedPreviewRequests(page,url,{token,postId:9});
    const route = (requestUrl=url, method='GET', navigation=true, status=200) => ({
      request:()=>({method:()=>method,isNavigationRequest:()=>navigation,frame:()=>frame,url:()=>requestUrl,redirectedFrom:()=>null,headers:()=>({accept:'text/html'})}),
      abort:vi.fn(),continue:vi.fn(),fetch:vi.fn(async()=>({status:()=>status})),fulfill:vi.fn(),
    });
    const document=route(); await handler(document as unknown as Route);
    expect(document.fetch).toHaveBeenCalledWith({maxRedirects:0,headers:{accept:'text/html','X-Pixflow-Preview':token}});
    expect(document.fulfill).toHaveBeenCalledOnce();
    const redirect=route(url,'GET',true,302); await handler(redirect as unknown as Route);
    expect(redirect.abort).toHaveBeenCalledOnce(); expect(redirect.fulfill).not.toHaveBeenCalled();
    const failed=route(); failed.fetch.mockRejectedValueOnce(new Error('headers: '+token));
    await handler(failed as unknown as Route);
    expect(failed.abort).toHaveBeenCalledOnce(); expect(failed.fulfill).not.toHaveBeenCalled();
    for(const blocked of [route('https://other.example/'),route(url,'POST'),route(url,'HEAD')]) {
      await handler(blocked as unknown as Route); expect(blocked.abort).toHaveBeenCalledOnce();expect(blocked.fetch).not.toHaveBeenCalled();
    }
    const image=route('https://images.example/photo.webp','GET',false);await handler(image as unknown as Route);
    expect(image.continue).toHaveBeenCalledWith();expect(image.fetch).not.toHaveBeenCalled();
  });
  it('rejects grants whose document scope is malformed', async () => {
    const page={route:vi.fn()} as unknown as Page;
    for(const url of ['https://site.example/?page_id=8&preview=true','https://site.example/wp-admin/?page_id=9&preview=true','https://site.example/?page_id=9&preview=true&action=delete']) {
      await expect(scopeSavedPreviewRequests(page,url,{token:'a'.repeat(64),postId:9})).rejects.toThrow('scope');
    }
    expect(page.route).not.toHaveBeenCalled();
  });
});
