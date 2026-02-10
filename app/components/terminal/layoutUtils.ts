import type { PaneNode, LeafNode } from './splitTypes';

/** Find a leaf node by paneId */
export function findLeaf(tree: PaneNode, paneId: string): LeafNode | null {
  if (tree.type === 'leaf') {
    return tree.paneId === paneId ? tree : null;
  }
  return findLeaf(tree.first, paneId) || findLeaf(tree.second, paneId);
}

/** Replace a leaf node by paneId with a new node, returns a new tree */
export function replaceLeaf(tree: PaneNode, paneId: string, newNode: PaneNode): PaneNode {
  if (tree.type === 'leaf') {
    return tree.paneId === paneId ? newNode : tree;
  }
  return {
    ...tree,
    first: replaceLeaf(tree.first, paneId, newNode),
    second: replaceLeaf(tree.second, paneId, newNode),
  };
}

/** Remove a leaf node, promoting its sibling. Returns null if tree is just one leaf. */
export function removeLeaf(tree: PaneNode, paneId: string): PaneNode | null {
  if (tree.type === 'leaf') {
    return tree.paneId === paneId ? null : tree;
  }

  // Check if either direct child is the target leaf
  if (tree.first.type === 'leaf' && tree.first.paneId === paneId) {
    return tree.second;
  }
  if (tree.second.type === 'leaf' && tree.second.paneId === paneId) {
    return tree.first;
  }

  // Recurse into children
  const newFirst = removeLeaf(tree.first, paneId);
  if (newFirst !== tree.first) {
    return newFirst === null ? tree.second : { ...tree, first: newFirst };
  }

  const newSecond = removeLeaf(tree.second, paneId);
  if (newSecond !== tree.second) {
    return newSecond === null ? tree.first : { ...tree, second: newSecond };
  }

  return tree;
}

/** Get all leaf nodes from the tree */
export function getAllLeaves(tree: PaneNode): LeafNode[] {
  if (tree.type === 'leaf') return [tree];
  return [...getAllLeaves(tree.first), ...getAllLeaves(tree.second)];
}

