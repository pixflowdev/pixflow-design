/** Site-owned page destinations. Opening never imports or converts content. */
export type PixflowBuilderId = 'gutenberg' | 'bricks' | 'etch' | 'elementor';
export interface PixflowBuilderDestination {
  postId: number;
  title: string;
  status: string;
  builder: PixflowBuilderId;
  editorUrl: string;
}
export interface PixflowBuilderDestinationList {
  builders: Array<{ id: PixflowBuilderId; label: string; available: boolean; reason?: string }>;
  pages: PixflowBuilderDestination[];
  hasMore: boolean;
}
export type PixflowBuilderDestinationRequest =
  | { action: 'create'; builder: PixflowBuilderId; title: string; requestId: string }
  | { action: 'open'; builder: PixflowBuilderId; postId: number };
export interface PixflowBuilderDestinationResult {
  destination: PixflowBuilderDestination;
  created: boolean;
  reused: boolean;
}
