/** Transient host UI contract. Never persist DOM nodes or navigation callbacks. */
export type NativeReviewTarget = {
  element: HTMLElement;
  builder: string;
  postId: number | string;
  index: number;
  count: number;
  label: string;
  navigate(direction: number): void;
  dismiss(): void;
};
export const nativeReviewTargetEvent = 'pixflow:review-target';
