'use client';

import React from 'react';
import type { ToolState } from '../types';

interface ToolbarProps {
  state: ToolState;
  onChange: (state: ToolState) => void;
  onClear?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ state, onChange, onClear }) => {
  const update = (patch: Partial<ToolState>) => onChange({ ...state, ...patch });

  return (
    <div
      className="jp-toolbar flex flex-wrap items-center gap-2 p-2"
      data-testid="jsonpath-toolbar"
    >
      <label
        htmlFor="toolbar-query"
        className="text-xs font-medium text-gray-600 dark:text-gray-300"
      >
        Query
      </label>
      <input
        id="toolbar-query"
        type="text"
        value={state.query}
        onChange={(e) => update({ query: e.target.value })}
        placeholder="$.store.users[*].name"
        spellCheck={false}
        className="flex-1 min-w-48 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 font-mono text-xs"
        data-testid="toolbar-query-input"
      />
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
          data-testid="toolbar-clear"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
};

export default Toolbar;
