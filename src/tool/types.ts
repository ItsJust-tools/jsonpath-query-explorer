/** The persistent tool state: JSON input text plus the active JSONPath query. */
export interface ToolState {
  /** Raw JSON text entered by the user (may be empty or malformed). */
  jsonInput: string;
  /** Active JSONPath query in $-notation, e.g. `$.users[*].name`. */
  query: string;
}

export const DEFAULT_JSON_INPUT = `{
  "store": {
    "users": [
      { "id": 1, "name": "Ada", "role": "admin" },
      { "id": 2, "name": "Grace", "role": "editor" },
      { "id": 3, "name": "Linus", "role": "viewer" }
    ],
    "orders": [
      { "id": "o-1", "total": 42.5, "items": ["keyboard", "mouse"] },
      { "id": "o-2", "total": 128, "items": ["monitor"] }
    ],
    "inventory": {
      "keyboard": { "stock": 12, "price": 49.99 },
      "mouse": { "stock": 30, "price": 24.5 },
      "monitor": { "stock": 5, "price": 199 }
    }
  }
}`;

export const DEFAULT_STATE: ToolState = {
  jsonInput: DEFAULT_JSON_INPUT,
  query: '$.store.users[*].name',
};

/** A single JSONPath match with its normalized source path. */
export interface JsonPathMatch {
  /** Canonical $-notation path of the match, e.g. `$.store.users[0].name`. */
  path: string;
  /** The matched value. */
  value: unknown;
}

/** Result of running a query: matches on success, an error string on failure. */
export interface QueryResult {
  matches: JsonPathMatch[];
  error: string | null;
}

/** One node of the rendered JSON tree. */
export interface JsonTreeNode {
  /** Display key: property name, array index, or 'root'. */
  key: string;
  /** JSONPath from the document root to this node. */
  path: string;
  /** The node value. */
  value: unknown;
  /** Child nodes of objects/arrays, sorted by key then insertion order. */
  children: JsonTreeNode[];
  /** Type label used for badges: object, array, string, number, boolean, null. */
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
}

export const SAMPLE_PRESETS = ['users', 'orders', 'inventory'] as const;
export type SamplePreset = (typeof SAMPLE_PRESETS)[number];

export const SAMPLE_DATASETS: Record<SamplePreset, { label: string; json: string; query: string }> =
  {
    users: {
      label: 'Users',
      json: JSON.stringify(
        {
          users: [
            { id: 1, name: 'Ada', role: 'admin', active: true },
            { id: 2, name: 'Grace', role: 'editor', active: true },
            { id: 3, name: 'Linus', role: 'viewer', active: false },
          ],
        },
        null,
        2
      ),
      query: '$.users[?(@.role == "admin")].name',
    },
    orders: {
      label: 'Orders',
      json: JSON.stringify(
        {
          orders: [
            { id: 'o-1', total: 42.5, items: ['keyboard', 'mouse'] },
            { id: 'o-2', total: 128, items: ['monitor'] },
            { id: 'o-3', total: 7.25, items: [] },
          ],
        },
        null,
        2
      ),
      query: '$.orders[?(@.total > 10)].items[*]',
    },
    inventory: {
      label: 'Inventory',
      json: JSON.stringify(
        {
          inventory: {
            keyboard: { stock: 12, price: 49.99 },
            mouse: { stock: 30, price: 24.5 },
            monitor: { stock: 5, price: 199 },
            warehouse: { overflow: [{ sku: 'KB-1', stock: 40 }] },
          },
        },
        null,
        2
      ),
      query: '$..stock',
    },
  };
