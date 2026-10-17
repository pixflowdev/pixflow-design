// Plan G4 — Phase 2B router contract for the marketplace routes.

import { describe, expect, it } from 'vitest';
import { buildPath, parseRoute, type Route } from '../src/router';

describe('router entry sub-views', () => {
  it('parses /projects (no id) as the projects entry view', () => {
    expect(parseRoute('/projects')).toEqual({ kind: 'home', view: 'projects' });
    expect(parseRoute('/projects/')).toEqual({ kind: 'home', view: 'projects' });
  });

  it('parses /design-systems as the design-systems entry view', () => {
    expect(parseRoute('/design-systems')).toEqual({ kind: 'home', view: 'design-systems' });
  });

  it('retires standalone automations and integrations workspace routes', () => {
    expect(parseRoute('/automations')).toEqual({ kind: 'home', view: 'home' });
    expect(parseRoute('/tasks')).toEqual({ kind: 'home', view: 'home' });
    expect(parseRoute('/integrations')).toEqual({ kind: 'home', view: 'home' });
  });

  it('still parses /projects/<id> as a project detail route', () => {
    expect(parseRoute('/projects/abc')).toEqual({
      kind: 'project',
      projectId: 'abc',
      conversationId: null,
      fileName: null,
    });
  });

  it('round-trips entry sub-views through buildPath', () => {
    for (const route of [
      { kind: 'home', view: 'home' } as Route,
      { kind: 'home', view: 'onboarding' } as Route,
      { kind: 'home', view: 'projects' } as Route,
      { kind: 'home', view: 'plugins' } as Route,
      { kind: 'home', view: 'design-systems' } as Route,
    ]) {
      expect(parseRoute(buildPath(route))).toEqual(route);
    }
  });

  it('parses /onboarding as the global onboarding panel', () => {
    expect(parseRoute('/onboarding')).toEqual({ kind: 'home', view: 'onboarding' });
    expect(buildPath({ kind: 'home', view: 'onboarding' })).toBe('/onboarding');
  });
});
