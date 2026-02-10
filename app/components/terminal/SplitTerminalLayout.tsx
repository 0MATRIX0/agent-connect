'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { PaneNode, SplitDirection } from './splitTypes';
import type { TerminalHandle } from '../Terminal';

const Terminal = dynamic(() => import('../Terminal'), { ssr: false });

interface SplitTerminalLayoutProps {
  layout: PaneNode;
  activePaneId: string;
  onPaneFocus: (paneId: string) => void;
  onSplit: (paneId: string, direction: SplitDirection) => void;
  onClosePane: (paneId: string) => void;
  onLayoutChange: (layout: PaneNode) => void;
  paneRefs: React.MutableRefObject<Map<string, TerminalHandle>>;
  wsToken: string;
  onSessionEnd: (paneId: string) => void;
  onConnectionChange: (paneId: string, status: string) => void;
  onContextMenu: (e: React.MouseEvent, paneId: string) => void;
}

export default function SplitTerminalLayout({
  layout,
  activePaneId,
  onPaneFocus,
  onLayoutChange,
  paneRefs,
  wsToken,
  onSessionEnd,
  onConnectionChange,
  onContextMenu,
}: SplitTerminalLayoutProps) {
  return (
    <div className="w-full h-full">
      <PaneRenderer
        node={layout}
        activePaneId={activePaneId}
        onPaneFocus={onPaneFocus}
        onLayoutChange={onLayoutChange}
        layout={layout}
        paneRefs={paneRefs}
        wsToken={wsToken}
        onSessionEnd={onSessionEnd}
        onConnectionChange={onConnectionChange}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}

interface PaneRendererProps {
  node: PaneNode;
  activePaneId: string;
  onPaneFocus: (paneId: string) => void;
  onLayoutChange: (layout: PaneNode) => void;
  layout: PaneNode;
  paneRefs: React.MutableRefObject<Map<string, TerminalHandle>>;
  wsToken: string;
  onSessionEnd: (paneId: string) => void;
  onConnectionChange: (paneId: string, status: string) => void;
  onContextMenu: (e: React.MouseEvent, paneId: string) => void;
  // Path in the tree for ratio updates
  path?: ('first' | 'second')[];
}

function PaneRenderer({
  node,
  activePaneId,
  onPaneFocus,
  onLayoutChange,
  layout,
  paneRefs,
  wsToken,
  onSessionEnd,
  onConnectionChange,
  onContextMenu,
}: PaneRendererProps) {
  if (node.type === 'leaf') {
    return (
      <LeafPane
        sessionId={node.sessionId}
        paneId={node.paneId}
        isActive={node.paneId === activePaneId}
        onFocus={() => onPaneFocus(node.paneId)}
        onContextMenu={(e) => onContextMenu(e, node.paneId)}
        paneRefs={paneRefs}
        wsToken={wsToken}
        onSessionEnd={() => onSessionEnd(node.paneId)}
        onConnectionChange={(status) => onConnectionChange(node.paneId, status)}
      />
    );
  }

  return (
    <SplitPane
      node={node}
      activePaneId={activePaneId}
      onPaneFocus={onPaneFocus}
      onLayoutChange={onLayoutChange}
      layout={layout}
      paneRefs={paneRefs}
      wsToken={wsToken}
      onSessionEnd={onSessionEnd}
      onConnectionChange={onConnectionChange}
      onContextMenu={onContextMenu}
    />
  );
}

interface SplitPaneProps {
  node: PaneNode & { type: 'split' };
  activePaneId: string;
  onPaneFocus: (paneId: string) => void;
  onLayoutChange: (layout: PaneNode) => void;
  layout: PaneNode;
  paneRefs: React.MutableRefObject<Map<string, TerminalHandle>>;
  wsToken: string;
  onSessionEnd: (paneId: string) => void;
  onConnectionChange: (paneId: string, status: string) => void;
  onContextMenu: (e: React.MouseEvent, paneId: string) => void;
}

function SplitPane({
  node,
  activePaneId,
  onPaneFocus,
  onLayoutChange,
  layout,
  paneRefs,
  wsToken,
  onSessionEnd,
  onConnectionChange,
  onContextMenu,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(node.ratio);
  const dragging = useRef(false);
  const ratioRef = useRef(ratio);

  // Sync ratio from props
  useEffect(() => {
    setRatio(node.ratio);
    ratioRef.current = node.ratio;
  }, [node.ratio]);

  const isVertical = node.direction === 'vertical';

  // Stable refs for layout callbacks to avoid stale closures
  const layoutRef = useRef(layout);
  const onLayoutChangeRef = useRef(onLayoutChange);
  layoutRef.current = layout;
  onLayoutChangeRef.current = onLayoutChange;

  // Get the first leaf paneId of this node's first child — used to identify this split structurally
  const firstLeafId = useRef(getFirstLeafId(node.first));
  firstLeafId.current = getFirstLeafId(node.first);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let newRatio: number;
      if (isVertical) {
        newRatio = (e.clientX - rect.left) / rect.width;
      } else {
        newRatio = (e.clientY - rect.top) / rect.height;
      }
      newRatio = Math.max(0.1, Math.min(0.9, newRatio));
      setRatio(newRatio);
      ratioRef.current = newRatio;
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Commit the final ratio to the layout tree using structural matching
      const finalRatio = ratioRef.current;
      const currentLayout = layoutRef.current;
      const newTree = updateSplitRatioByFirstLeaf(currentLayout, firstLeafId.current, finalRatio);
      if (newTree !== currentLayout) {
        onLayoutChangeRef.current(newTree);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isVertical]);

  const firstStyle = isVertical
    ? { width: `${ratio * 100}%`, height: '100%' }
    : { height: `${ratio * 100}%`, width: '100%' };

  const secondStyle = isVertical
    ? { width: `${(1 - ratio) * 100}%`, height: '100%' }
    : { height: `${(1 - ratio) * 100}%`, width: '100%' };

  return (
    <div
      ref={containerRef}
      className={`flex ${isVertical ? 'flex-row' : 'flex-col'} w-full h-full`}
    >
      <div style={firstStyle} className="overflow-hidden">
        <PaneRenderer
          node={node.first}
          activePaneId={activePaneId}
          onPaneFocus={onPaneFocus}
          onLayoutChange={onLayoutChange}
          layout={layout}
          paneRefs={paneRefs}
          wsToken={wsToken}
          onSessionEnd={onSessionEnd}
          onConnectionChange={onConnectionChange}
          onContextMenu={onContextMenu}
        />
      </div>

      {/* Resize handle */}
      <div
        className={`
          shrink-0 transition-colors
          ${isVertical
            ? 'w-[4px] cursor-col-resize hover:bg-white/20 active:bg-white/30'
            : 'h-[4px] cursor-row-resize hover:bg-white/20 active:bg-white/30'
          }
          ${dragging.current ? 'bg-white/30' : 'bg-transparent'}
        `}
        onMouseDown={handleMouseDown}
      />

      <div style={secondStyle} className="overflow-hidden">
        <PaneRenderer
          node={node.second}
          activePaneId={activePaneId}
          onPaneFocus={onPaneFocus}
          onLayoutChange={onLayoutChange}
          layout={layout}
          paneRefs={paneRefs}
          wsToken={wsToken}
          onSessionEnd={onSessionEnd}
          onConnectionChange={onConnectionChange}
          onContextMenu={onContextMenu}
        />
      </div>
    </div>
  );
}

/** Get the paneId of the leftmost/topmost leaf in a subtree */
function getFirstLeafId(node: PaneNode): string {
  if (node.type === 'leaf') return node.paneId;
  return getFirstLeafId(node.first);
}

/** Find and update the ratio of a split node whose first child contains a specific leaf paneId */
function updateSplitRatioByFirstLeaf(tree: PaneNode, leafId: string, newRatio: number): PaneNode {
  if (tree.type === 'leaf') return tree;

  // Check if this split's first child contains the target leaf
  if (getFirstLeafId(tree.first) === leafId) {
    return { ...tree, ratio: newRatio };
  }

  // Recurse
  const newFirst = updateSplitRatioByFirstLeaf(tree.first, leafId, newRatio);
  const newSecond = updateSplitRatioByFirstLeaf(tree.second, leafId, newRatio);
  if (newFirst !== tree.first || newSecond !== tree.second) {
    return { ...tree, first: newFirst, second: newSecond };
  }
  return tree;
}

interface LeafPaneProps {
  sessionId: string;
  paneId: string;
  isActive: boolean;
  onFocus: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  paneRefs: React.MutableRefObject<Map<string, TerminalHandle>>;
  wsToken: string;
  onSessionEnd: () => void;
  onConnectionChange: (status: string) => void;
}

function LeafPane({
  sessionId,
  paneId,
  isActive,
  onFocus,
  onContextMenu,
  paneRefs,
  wsToken,
  onSessionEnd,
  onConnectionChange,
}: LeafPaneProps) {
  const termRef = useRef<TerminalHandle>(null);

  // Register ref in parent's paneRefs map
  useEffect(() => {
    if (termRef.current) {
      paneRefs.current.set(paneId, termRef.current);
    }
    return () => {
      paneRefs.current.delete(paneId);
    };
  }, [paneId, paneRefs]);

  // Also update ref when terminal mounts (dynamic import may delay)
  const handleRefUpdate = useCallback((handle: TerminalHandle | null) => {
    if (handle) {
      (termRef as React.MutableRefObject<TerminalHandle | null>).current = handle;
      paneRefs.current.set(paneId, handle);
    }
  }, [paneId, paneRefs]);

  function getWsUrl() {
    const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
    const base = `${proto}//${host}/ws/sessions/${sessionId}`;
    return wsToken ? `${base}?token=${wsToken}` : base;
  }

  return (
    <div
      className={`h-full w-full relative ${
        isActive ? 'ring-1 ring-emerald-500/30' : ''
      }`}
      onClick={onFocus}
      onContextMenu={(e) => {
        e.preventDefault();
        onFocus();
        onContextMenu(e);
      }}
    >
      <Terminal
        ref={handleRefUpdate}
        sessionId={sessionId}
        wsUrl={getWsUrl()}
        onSessionEnd={() => onSessionEnd()}
        onConnectionChange={(status) => onConnectionChange(status)}
        onFocus={onFocus}
      />
    </div>
  );
}
