'use client';

import React from 'react';
import {
  buildJsonTree,
  parseJsonInput,
  previewValue,
  runQuery,
  segmentsToPath,
  parseJsonPath,
} from '../jsonpath';
import type { JsonPathMatch, JsonTreeNode, ToolState } from '../types';
import { SAMPLE_DATASETS, SAMPLE_PRESETS, type SamplePreset } from '../types';

export const JSONPATH_CHEATSHEET: Array<{ syntax: string; meaning: string }> = [
  { syntax: '$', meaning: 'Root of the document' },
  { syntax: '.name', meaning: 'Child member' },
  { syntax: '["name"]', meaning: 'Child member (quoted)' },
  { syntax: '[0]', meaning: 'Array index (negative counts from the end)' },
  { syntax: '[*]', meaning: 'Wildcard: all members or elements' },
  { syntax: '..name', meaning: 'Recursive descent: name at any depth' },
  { syntax: '[1:5]', meaning: 'Array slice with optional step [start:end:step]' },
  { syntax: '[?(@.price < 10)]', meaning: 'Filter comparison' },
  { syntax: '[?(@.a && @.b)]', meaning: 'Filter with && / || logic' },
  { syntax: '[?(@.name =~ /ada/i)]', meaning: 'Regex match filter' },
  { syntax: '$..[2]', meaning: 'Combine descent, union and filters' },
];

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }, [value]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="copy-btn text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-gray-800"
      aria-label={label}
      data-testid="copy-match"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function TreeNode({
  node,
  depth,
  matchedPaths,
  onClick,
  onToggle,
  expanded,
}: {
  node: JsonTreeNode;
  depth: number;
  matchedPaths: Set<string>;
  onClick: (path: string) => void;
  onToggle: (path: string) => void;
  expanded: Set<string>;
}) {
  const isMatch = matchedPaths.has(node.path);
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.path) || depth === 0;
  return (
    <div>
      <div
        className={`jp-node flex items-center gap-1 rounded px-1 py-0.5 ${isMatch ? 'jp-match bg-sky-100 dark:bg-sky-900/40' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        data-testid={`tree-node-${node.path}`}
      >
        {hasChildren ? (
          <button
            type="button"
            className="text-gray-500 w-4 text-left"
            aria-label={isOpen ? `Collapse ${node.path}` : `Expand ${node.path}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.path);
            }}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <button
          type="button"
          className="text-left font-mono text-xs flex-1 truncate"
          title={`Insert ${node.path} into the query`}
          onClick={() => onClick(node.path)}
        >
          {node.key === 'root' ? <span className="text-gray-500">$ (root)</span> : node.key}{' '}
          <span
            className={`jp-type ml-1 rounded px-1 text-[10px] ${
              node.type === 'object' || node.type === 'array'
                ? 'text-sky-700 dark:text-sky-300'
                : node.type === 'string'
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : node.type === 'number'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-gray-500'
            }`}
          >
            {node.type}
            {node.type === 'object' || node.type === 'array' ? `(${node.children.length})` : ''}
          </span>
          {node.type !== 'object' && node.type !== 'array' ? (
            <span className="jp-value text-gray-400"> {previewValue(node.value, 40)}</span>
          ) : null}
        </button>
      </div>
      {hasChildren && isOpen
        ? node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              matchedPaths={matchedPaths}
              onClick={onClick}
              onToggle={onToggle}
              expanded={expanded}
            />
          ))
        : null}
    </div>
  );
}

interface CanvasProps {
  state: ToolState;
  onChange: (state: ToolState) => void;
}

export const Canvas: React.FC<CanvasProps> = ({ state, onChange }) => {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set(['$']));
  const [queryDraft, setQueryDraft] = React.useState(state.query);
  const [jsonDraft, setJsonDraft] = React.useState(state.jsonInput);
  const [committed, setCommitted] = React.useState<ToolState | null>(state);

  React.useEffect(() => {
    if (state !== committed) {
      setQueryDraft(state.query);
      setJsonDraft(state.jsonInput);
      setCommitted(state);
    }
  }, [state, committed]);

  const parsed = React.useMemo(() => parseJsonInput(jsonDraft), [jsonDraft]);
  const queryParsed = React.useMemo(() => parseJsonPath(queryDraft), [queryDraft]);
  const queryResult = React.useMemo(
    () =>
      parsed.doc !== null ? runQuery(queryDraft, parsed.doc) : { matches: [], error: parsed.error },
    [queryDraft, parsed]
  );
  const tree = React.useMemo(
    () => (parsed.doc !== null ? buildJsonTree(parsed.doc) : null),
    [parsed]
  );
  const matchedPaths = React.useMemo(
    () => new Set((queryResult.matches ?? []).map((m) => m.path)),
    [queryResult.matches]
  );

  const update = (patch: Partial<ToolState>) => onChange({ ...state, ...patch });

  const commitRun = React.useCallback(() => {
    update({ jsonInput: jsonDraft, query: queryDraft });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonDraft, queryDraft, state]);

  const insertPath = React.useCallback(
    (path: string) => {
      const insertion = path === '$' ? '$' : path;
      setQueryDraft(insertion);
      update({ query: insertion });
    },
    [state]
  );

  const toggle = React.useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const loadSample = React.useCallback(
    (preset: SamplePreset) => {
      const sample = SAMPLE_DATASETS[preset];
      setJsonDraft(sample.json);
      setQueryDraft(sample.query);
      update({ jsonInput: sample.json, query: sample.query });
    },
    [state]
  );

  const handleUpload = React.useCallback(
    async (file: File | null) => {
      if (!file) return;
      const text = await file.text();
      setJsonDraft(text);
      update({ jsonInput: text });
    },
    [state]
  );

  const error = parsed.error ?? null;
  const queryError = queryParsed.ok ? null : queryParsed.error;
  const matches: JsonPathMatch[] =
    queryResult.error && !queryError ? [] : (queryResult.matches ?? []);
  const resultError = queryError ?? queryResult.error ?? null;
  const showResults = !error;

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full" data-testid="jsonpath-canvas">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
          Sample data
        </span>
        {SAMPLE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => loadSample(preset)}
            data-testid={`sample-${preset}`}
          >
            {SAMPLE_DATASETS[preset].label}
          </button>
        ))}
        <label className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
          Upload JSON
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
            data-testid="json-upload"
          />
        </label>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <div
          className="jp-pane rounded-md border border-gray-200 dark:border-gray-800 p-2"
          data-testid="json-tree-pane"
        >
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">
              JSON tree
            </h3>
            <span className="text-xs text-gray-400">Click a node to insert its path</span>
          </div>
          {error ? (
            <p
              role="alert"
              className="text-xs text-red-600 dark:text-red-400"
              data-testid="json-input-error"
            >
              {error}
            </p>
          ) : tree ? (
            <div className="jp-tree max-h-96 overflow-auto font-mono text-xs">
              <TreeNode
                node={tree}
                depth={0}
                matchedPaths={matchedPaths}
                onClick={insertPath}
                onToggle={toggle}
                expanded={expanded}
              />
            </div>
          ) : null}
          <div className="mt-2">
            <textarea
              id="json-input"
              aria-label="JSON input"
              value={jsonDraft}
              onChange={(e) => setJsonDraft(e.target.value)}
              spellCheck={false}
              className="w-full h-40 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 font-mono text-xs"
              placeholder="Paste JSON here"
              data-testid="json-input-textarea"
            />
          </div>
        </div>

        <div className="space-y-2" data-testid="query-pane">
          <label
            htmlFor="jsonpath-query"
            className="text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300"
          >
            JSONPath query
          </label>
          <div className="flex gap-2">
            <input
              id="jsonpath-query"
              type="text"
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              placeholder="$.store.users[*].name"
              spellCheck={false}
              className={`flex-1 rounded border px-3 py-1.5 font-mono text-sm ${
                queryError
                  ? 'border-red-400 dark:border-red-600'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
              aria-invalid={Boolean(queryError)}
              data-testid="jsonpath-query-input"
            />
            <button
              type="button"
              className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
              onClick={commitRun}
              data-testid="run-query"
            >
              Run
            </button>
          </div>
          <p className="text-xs" data-testid="result-count" aria-live="polite">
            {error || resultError ? (
              <span
                role="alert"
                className="text-red-600 dark:text-red-400"
                data-testid="query-error"
              >
                {error && !resultError ? error : resultError}
              </span>
            ) : (
              <span className="text-gray-500">
                {matches.length} match{matches.length === 1 ? '' : 'es'}
              </span>
            )}
          </p>
          {queryError ? null : (
            <p className="text-xs text-gray-500" data-testid="normalized-query">
              Normalized:{' '}
              <code>{queryParsed.ok ? segmentsToPath(queryParsed.segments) : queryDraft}</code>
            </p>
          )}

          {showResults ? (
            <ol className="jp-results space-y-1" data-testid="results-list">
              {matches.map((match, index) => (
                <li
                  key={`${match.path}-${index}`}
                  className="flex items-start justify-between gap-2 rounded border border-gray-200 dark:border-gray-800 px-2 py-1.5"
                  data-testid="result-item"
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      className="block max-w-full truncate font-mono text-[11px] text-sky-700 dark:text-sky-300 hover:underline"
                      title={match.path}
                      onClick={() => insertPath(match.path)}
                    >
                      {match.path}
                    </button>
                    <div className="truncate font-mono text-xs" data-testid="result-value">
                      {previewValue(match.value)}
                    </div>
                  </div>
                  <CopyButton
                    value={JSON.stringify(match.value) ?? ''}
                    label={`Copy match ${index + 1}`}
                  />
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default Canvas;
