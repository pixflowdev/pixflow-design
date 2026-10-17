/** Authenticated WordPress response; premium features still require a signed entitlement. */
export interface PixflowBridgeFeatureGrant {
  token?: string;
  free_access?: boolean;
  network_unavailable?: boolean;
  features?: string[];
}
