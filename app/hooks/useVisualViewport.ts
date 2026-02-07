import { useState, useEffect } from 'react';

interface VisualViewportState {
  viewportHeight: string;
  keyboardVisible: boolean;
}

export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>({
    viewportHeight: '100vh',
    keyboardVisible: false,
  });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function onResize() {
      const vv = window.visualViewport!;
      const keyboardHeight = window.innerHeight - vv.height;
      const visible = keyboardHeight > 100;
      setState({
        viewportHeight: `${vv.height}px`,
        keyboardVisible: visible,
      });
    }

    onResize();
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  return state;
}
