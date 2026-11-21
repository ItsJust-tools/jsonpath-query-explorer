'use client';

import { useCallback } from 'react';
import { Sidebar } from './Sidebar';
import type { ToolState } from '../types';

interface ToolSidebarProps {
  state: ToolState;
  fontSize?: number;
  onFontSizeChange?: (delta: number) => void;
}

export function ToolSidebar({ state, fontSize, onFontSizeChange }: ToolSidebarProps) {
  const handleChange = useCallback((next: ToolState) => {
    // sidebar is read-only over state; kept for interface consistency
    void next;
  }, []);

  return (
    <div className="jp-sidebar-host">
      <Sidebar
        state={state}
        fontSize={fontSize}
        onFontSizeChange={onFontSizeChange}
        onChange={handleChange}
      />
    </div>
  );
}
