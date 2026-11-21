'use client';

import { useCallback } from 'react';
import { Canvas } from './Canvas';
import { Toolbar } from './Toolbar';
import type { ToolState } from '../types';

interface ToolCanvasProps {
  state: ToolState;
  fontSize?: number;
  readOnly?: boolean;
  canvasRef?: React.RefObject<HTMLDivElement | null>;
  onStateChange?: (updater: (prev: ToolState) => ToolState) => void;
  onClear?: () => void;
}

export function ToolCanvas({
  state,
  readOnly = false,
  canvasRef,
  onStateChange,
  onClear,
}: ToolCanvasProps) {
  const handleChange = useCallback(
    (next: ToolState) => {
      onStateChange?.(() => next);
    },
    [onStateChange]
  );

  return (
    <div
      ref={canvasRef}
      className="jp-canvas"
      role="application"
      aria-label="JSONPath query explorer canvas"
    >
      {onClear ? <Toolbar state={state} onChange={handleChange} onClear={onClear} /> : null}
      <Canvas state={state} onChange={handleChange} />
      {readOnly ? null : null}
    </div>
  );
}
