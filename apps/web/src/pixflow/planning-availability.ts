import { pixflowFeatureEnabled, pixflowFeatureAdvertised } from './feature-runtime';
/** Asset presence follows the server's active optional feature contribution. */
export function planningAvailable(): boolean {
  return typeof window !== 'undefined' && pixflowFeatureEnabled('planning') && (typeof (window as Window & { PixflowPlanningFactory?: unknown }).PixflowPlanningFactory === 'function' || pixflowFeatureAdvertised('planning', 'pixflow-planning'));
}
