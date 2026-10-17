import { pixflowFeatureEnabled } from './feature-runtime';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as JSXRuntime from 'react/jsx-runtime';
import * as I18n from '../i18n';
import * as Analytics from '../analytics/provider';
import type { ExternalMcpContribution } from './external-mcp-contract';
type Contribution = ExternalMcpContribution;
type Factory = (host: {modules: Record<string,unknown>}) => Contribution;
let factory: Factory | undefined;
let contribution: Contribution | undefined;
export function externalMcpAvailable(): boolean { return typeof window !== 'undefined' && pixflowFeatureEnabled('external-mcp') && typeof (window as Window & {PixflowExternalMcpFactory?: unknown}).PixflowExternalMcpFactory === 'function'; }
export function externalMcpContribution() {
  const next = typeof window === 'undefined' ? undefined : (window as Window & {PixflowExternalMcpFactory?: Factory}).PixflowExternalMcpFactory;
  if (next !== factory) {
    contribution = next?.({modules:{react:React,'react-dom':ReactDOM,'react/jsx-runtime':JSXRuntime,'pixflow-host-i18n':I18n,'pixflow-host-analytics':Analytics}});
    factory = next;
  }
  return contribution;
}
export const McpClientSection = React.forwardRef<React.ComponentRef<Contribution['McpClientSection']>, React.ComponentPropsWithoutRef<Contribution['McpClientSection']>>((props,ref)=>{
  const Component = externalMcpContribution()?.McpClientSection;
  return Component ? <Component {...props} ref={ref}/> : null;
});
