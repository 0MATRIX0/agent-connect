export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitNode {
  type: 'split';
  direction: SplitDirection;
  ratio: number; // 0.0–1.0
  first: PaneNode;
  second: PaneNode;
}

export interface LeafNode {
  type: 'leaf';
  sessionId: string;
  paneId: string;
}

export type PaneNode = SplitNode | LeafNode;
