import { describe, it, expect } from 'vitest';
import {
  parseJsonPath,
  runQuery,
  parseJsonInput,
  buildJsonTree,
  buildPath,
  previewValue,
  segmentsToPath,
  compareFilterValues,
  applySegment,
  filterNodeToString,
} from '../../src/tool/jsonpath';
import {
  DEFAULT_STATE,
  DEFAULT_JSON_INPUT,
  SAMPLE_DATASETS,
  type ToolState,
} from '../../src/tool/types';
import { jsonPathTool } from '../../src/tool/tool-definition';

const state = (patch: Partial<ToolState> = {}): ToolState => ({ ...DEFAULT_STATE, ...patch });

describe('serialize/deserialize round-trip', () => {
  it('round-trips state with defaults', () => {
    const result = jsonPathTool.deserialize(JSON.parse(jsonPathTool.serialize(state())));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(DEFAULT_STATE);
  });

  it('round-trips custom json input and query', () => {
    const custom = state({ jsonInput: '{"a":[1,2]}', query: '$.a[0]' });
    const result = jsonPathTool.deserialize(JSON.parse(jsonPathTool.serialize(custom)));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(custom);
  });

  it('falls back to defaults after round-trip', () => {
    const serialized = jsonPathTool.serialize(DEFAULT_STATE);
    const reparsed = JSON.parse(serialized);
    const result = jsonPathTool.deserialize(reparsed);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.jsonInput).toBe(DEFAULT_JSON_INPUT);
    expect(result.data.query).toBe(DEFAULT_STATE.query);
  });

  it('rejects non-object payloads', () => {
    expect(jsonPathTool.deserialize(null).success).toBe(false);
    expect(jsonPathTool.deserialize('nope').success).toBe(false);
    expect(jsonPathTool.deserialize(42).success).toBe(false);
  });

  it('rejects payloads missing fields', () => {
    expect(jsonPathTool.deserialize({ query: '$.a' }).success).toBe(false);
    expect(jsonPathTool.deserialize({ jsonInput: '{}' }).success).toBe(false);
  });

  it('rejects oversized payloads', () => {
    const huge = 'x'.repeat(2_000_001);
    expect(jsonPathTool.deserialize({ jsonInput: huge, query: '$' }).success).toBe(false);
  });
});

describe('parseJsonInput error states', () => {
  it('returns an error for empty input', () => {
    const { doc, error } = parseJsonInput('');
    expect(doc).toBeNull();
    expect(error).toBe('JSON input is empty');
  });

  it('returns an error for whitespace-only input', () => {
    const { doc, error } = parseJsonInput('   \n  ');
    expect(error).toBe('JSON input is empty');
  });

  it('returns an error for malformed JSON', () => {
    const { doc, error } = parseJsonInput('{"a": 1,,}');
    expect(doc).toBeNull();
    expect(error).toMatch(/^Invalid JSON:/);
  });

  it('parses valid JSON', () => {
    const { doc, error } = parseJsonInput('{"a":1}');
    expect(error).toBeNull();
    expect(doc).toEqual({ a: 1 });
  });
});

describe('jsonpath query evaluation', () => {
  const doc = JSON.parse(DEFAULT_JSON_INPUT);

  it('child access', () => {
    const result = runQuery('$.store.users[0].name', doc);
    expect(result.error).toBeNull();
    expect(result.matches).toEqual([{ path: '$.store.users[0].name', value: 'Ada' }]);
  });

  it('wildcard over arrays', () => {
    const result = runQuery('$.store.users[*].id', doc);
    expect(result.matches.map((m) => m.value)).toEqual([1, 2, 3]);
  });

  it('negative index counts from the end', () => {
    const result = runQuery('$.store.users[-1].name', doc);
    expect(result.matches[0]?.value).toBe('Linus');
  });

  it('array slice', () => {
    const result = runQuery('$.store.users[0:2]', doc);
    expect(result.matches).toHaveLength(2);
    result.matches.forEach((m) => expect(m.path).toMatch(/^\$\.store\.users\[\d+(:\d+)?\]$/));
  });

  it('slice with step', () => {
    const list = [1, 2, 3, 4, 5];
    const result = runQuery('$[::2]', list);
    expect(result.matches.map((m) => m.value)).toEqual([1, 3, 5]);
  });

  it('recursive descent', () => {
    const result = runQuery('$..id', doc);
    expect(result.matches.map((m) => m.value)).toEqual([1, 2, 3, 'o-1', 'o-2']);
  });

  it('recursive descent wildcard', () => {
    const result = runQuery('$..*', { a: { b: 1 } });
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
  });

  it('filter comparison', () => {
    const result = runQuery('$.store.users[?(@.role == "admin")].name', doc);
    expect(result.matches.map((m) => m.value)).toEqual(['Ada']);
  });

  it('filter with numeric comparison', () => {
    const result = runQuery('$.store.orders[?(@.total > 50)].id', doc);
    expect(result.matches.map((m) => m.value)).toEqual(['o-2']);
  });

  it('filter with and/or logic', () => {
    const result = runQuery('$.store.users[?(@.role == "admin" || @.role == "editor")].name', doc);
    expect(result.matches.map((m) => m.value)).toEqual(['Ada', 'Grace']);
  });

  it('regex filter', () => {
    const result = runQuery('$.store.users[?(@.name =~ /^a/i)].name', doc);
    expect(result.matches.map((m) => m.value)).toEqual(['Ada']);
  });

  it('union selector', () => {
    const list = [{ a: 1, b: 2, c: 3 }];
    const result = runQuery('$[0]["a","c"]', list);
    expect(result.matches.map((m) => m.value)).toEqual([1, 3]);
  });

  it('filter against object values', () => {
    const result = runQuery('$.store.inventory[?(@.stock > 10)]', doc);
    expect(result.matches.map((m) => (m.value as { stock: number }).stock)).toEqual([12, 30]);
  });

  it('root reference inside filter', () => {
    const rootDoc = { limit: 2, items: [1, 2, 3, 4] };
    const result = runQuery('$.items[?(@ < $.limit)]', rootDoc);
    expect(result.matches.map((m) => m.value)).toEqual([1]);
  });
});

describe('query error reporting', () => {
  it('rejects empty queries', () => {
    const result = runQuery('', {});
    expect(result.error).toMatch(/^Enter a JSONPath/);
    expect(result.matches).toEqual([]);
  });

  it('rejects queries without a $ root', () => {
    const result = runQuery('store.users', {});
    expect(result.error).toMatch(/must start with \$/);
  });

  it('reports mismatched brackets', () => {
    const result = runQuery('$["a', {});
    expect(result.error).toBeTruthy();
  });

  it('reports invalid filter expressions', () => {
    const result = runQuery('$[?(@.a ==)]', {});
    expect(result.error).toBeTruthy();
  });

  it('reports zero matches without error', () => {
    const result = runQuery('$.missing.path', {});
    expect(result.error).toBeNull();
    expect(result.matches).toEqual([]);
  });
});

describe('path building from tree clicks', () => {
  it('builds $-notation paths for nested nodes', () => {
    expect(buildPath([{ key: 'store', isIndex: false }])).toBe('$.store');
    expect(
      buildPath([
        { key: 'store', isIndex: false },
        { key: '0', isIndex: true },
        { key: 'name', isIndex: false },
      ])
    ).toBe('$.store[0].name');
  });

  it('quotes special characters', () => {
    expect(buildPath([{ key: 'weird key', isIndex: false }])).toBe(
      '$["weird key"]'.replace('[', '.').replace(']', '')
    );
  });

  it('tree node click produces the correct path', () => {
    const doc = { users: [{ name: 'Ada' }] };
    const tree = buildJsonTree(doc);
    const usersNode = tree.children[0];
    if (!usersNode) throw new Error('missing users node');
    const itemNode = usersNode.children[0];
    if (!itemNode) throw new Error('missing item node');
    const nameNode = itemNode.children[0];
    if (!nameNode) throw new Error('missing name node');
    expect(usersNode.path).toBe('$.users');
    expect(itemNode.path).toBe('$.users[0]');
    expect(nameNode.path).toBe('$.users[0].name');
  });
});

describe('query normalization', () => {
  it('normalizes quoted access', () => {
    const parsed = parseJsonPath('$["users"][0]');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(segmentsToPath(parsed.segments)).toBe('$.users[0]');
  });

  it('normalizes slices preserving step', () => {
    const parsed = parseJsonPath('$[1:10:2]');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(segmentsToPath(parsed.segments)).toBe('$[1:10:2]');
  });

  it('normalizes filters back to canonical form', () => {
    const parsed = parseJsonPath('$[?(@.price<10)]');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(segmentsToPath(parsed.segments)).toBe('$[?(@.price < 10)]');
  });
});

describe('sample datasets', () => {
  it('each sample parses and returns matches for its query', () => {
    for (const preset of Object.keys(SAMPLE_DATASETS) as Array<keyof typeof SAMPLE_DATASETS>) {
      const sample = SAMPLE_DATASETS[preset];
      const parsed = parseJsonInput(sample.json);
      expect(parsed.error).toBeNull();
      const result = runQuery(sample.query, parsed.doc);
      expect(result.error).toBeNull();
      expect(result.matches.length).toBeGreaterThan(0);
    }
  });
});

describe('utility helpers', () => {
  it('compareFilterValues handles primitives and nulls', () => {
    expect(compareFilterValues(1, 1)).toBe(true);
    expect(compareFilterValues('a', 'a')).toBe(true);
    expect(compareFilterValues(null, null)).toBe(true);
    expect(compareFilterValues(null, 0)).toBe(false);
    expect(compareFilterValues(undefined, null)).toBe(false);
  });

  it('previewValue truncates long strings and summarizes objects', () => {
    expect(previewValue('null')).toBe('"null"');
    expect(previewValue(null)).toBe('null');
    expect(previewValue(5)).toBe('5');
    expect(previewValue(true)).toBe('true');
    const long = 'x'.repeat(200);
    expect(previewValue(long).length).toBeLessThan(90);
    expect(previewValue({ a: 1, b: 2 })).toContain('"a":1');
  });

  it('filterNodeToString renders operators', () => {
    const parsed = parseJsonPath('$[?(@.a >= 1 && @.b == "x")]');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const filterSeg = parsed.segments[0];
      if (!filterSeg) throw new Error('missing segment');
      expect(filterSeg.kind).toBe('filter');
      if (filterSeg.kind === 'filter') {
        expect(filterNodeToString(filterSeg.expression)).toBe('@.a >= 1 && @.b == "x"');
      }
    }
  });

  it('applySegment handles nulls and primitives gracefully', () => {
    expect(applySegment([null], { kind: 'wildcard' }, null, '$')).toEqual([]);
    expect(applySegment(['str'], { kind: 'index', index: 0 }, null, '$')).toEqual([]);
    expect(applySegment([5], { kind: 'child', names: ['a'] }, null, '$')).toEqual([]);
  });

  it('runQuery matches documented tool definition', () => {
    expect(jsonPathTool.id).toBe('tool-1795269875');
    expect(jsonPathTool.name).toBe('JSONPath Query Explorer');
  });
});
