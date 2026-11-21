'use client';

import React from 'react';
import type { ToolState } from '../types';
import { JSONPATH_CHEATSHEET } from './Canvas';

interface SidebarProps {
  state: ToolState;
  fontSize?: number;
  onFontSizeChange?: (delta: number) => void;
  onChange?: (state: ToolState) => void;
}

const CHEAT_SHEET: Array<{ syntax: string; meaning: string }> = JSONPATH_CHEATSHEET;

export const Sidebar: React.FC<SidebarProps> = ({ state, onFontSizeChange }) => {
  const stats = React.useMemo(() => {
    const text = state.jsonInput;
    const bytes = new TextEncoder().encode(text).length;
    return { chars: text.length, bytes };
  }, [state.jsonInput]);

  return (
    <div className="jp-sidebar p-3 space-y-4 text-sm" data-testid="jsonpath-sidebar">
      <div className="sidebar-section">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">Input stats</h3>
        <dl className="stats-list mt-1 space-y-1 text-xs">
          <div className="stat-row flex justify-between">
            <dt>Characters</dt>
            <dd>{stats.chars.toLocaleString()}</dd>
          </div>
          <div className="stat-row flex justify-between">
            <dt>Bytes (UTF-8)</dt>
            <dd>{stats.bytes.toLocaleString()}</dd>
          </div>
          <div className="stat-row flex justify-between">
            <dt>Query</dt>
            <dd className="max-w-[10rem] truncate font-mono" title={state.query}>
              {state.query || '—'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="sidebar-section">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">
          JSONPath cheat sheet
        </h3>
        <ul className="mt-1 space-y-1 text-xs">
          {CHEAT_SHEET.map((entry) => (
            <li key={entry.syntax}>
              <code className="font-mono text-sky-700 dark:text-sky-300">{entry.syntax}</code>
              <span className="ml-1 text-gray-500">— {entry.meaning}</span>
            </li>
          ))}
        </ul>
      </div>

      {onFontSizeChange ? (
        <div className="sidebar-section">
          <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">Font size</h3>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              aria-label="Decrease font size"
              onClick={() => onFontSizeChange(-2)}
              className="rounded border border-gray-300 px-2 text-xs dark:border-gray-700"
            >
              A-
            </button>
            <button
              type="button"
              aria-label="Increase font size"
              onClick={() => onFontSizeChange(2)}
              className="rounded border border-gray-300 px-2 text-xs dark:border-gray-700"
            >
              A+
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Sidebar;
