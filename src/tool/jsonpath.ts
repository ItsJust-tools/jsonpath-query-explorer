import type { JsonPathMatch, JsonTreeNode, QueryResult } from './types';

/**
 * A parsed JSONPath query: an ordered list of segments applied left to right
 * starting at the root value.
 */
export type PathSegment =
  | { kind: 'child'; names: string[] }
  | { kind: 'index'; index: number }
  | { kind: 'wildcard' }
  | { kind: 'descendant'; then: PathSegment[] | null }
  | { kind: 'slice'; start: number | null; end: number | null; step: number }
  | { kind: 'filter'; expression: FilterNode };

export type FilterNode =
  | { kind: 'comparison'; left: FilterOperand; op: ComparisonOp; right: FilterOperand }
  | { kind: 'and'; items: FilterNode[] }
  | { kind: 'or'; items: FilterNode[] }
  | { kind: 'exists'; operand: FilterOperand }
  | { kind: 'regex'; operand: FilterOperand; pattern: string; flags: string };

export type ComparisonOp = '==' | '!=' | '<' | '<=' | '>' | '>=';

export type FilterOperand =
  | { kind: 'current'; path: PathSegment[]; raw: string }
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'root'; path: PathSegment[]; raw: string };

export interface ParseSuccess {
  ok: true;
  segments: PathSegment[];
}

export interface ParseFailure {
  ok: false;
  error: string;
}

export type ParseResult = ParseSuccess | ParseFailure;

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function quoteIfNeeded(name: string): string {
  return IDENTIFIER_RE.test(name) ? `.${name}` : `.${JSON.stringify(name)}`;
}

/** Build the canonical $-notation path for a parsed path segment list. */
export function segmentsToPath(segments: PathSegment[]): string {
  let out = '$';
  for (const seg of segments) {
    switch (seg.kind) {
      case 'child':
        if (seg.names.length === 1) {
          const only = seg.names[0];
          if (only !== undefined) out += quoteIfNeeded(only);
        } else out += `[${seg.names.map((n) => JSON.stringify(n)).join(', ')}]`;
        break;
      case 'index':
        out += `[${seg.index}]`;
        break;
      case 'wildcard':
        out += '[*]';
        break;
      case 'descendant': {
        out += '..';
        if (seg.then && seg.then.length > 0) {
          const rest = segmentTailToPath(seg.then);
          out += rest.startsWith('.') || rest.startsWith('[') ? rest.slice(1) : rest;
        } else {
          out += '*';
        }
        break;
      }
      case 'slice': {
        const parts = [
          seg.start === null ? '' : String(seg.start),
          seg.end === null ? '' : String(seg.end),
        ];
        if (seg.step !== 1) parts.push(String(seg.step));
        out += `[${parts.join(':')}]`;
        break;
      }
      case 'filter':
        out += `[?(${filterNodeToString(seg.expression)})]`;
        break;
    }
  }
  return out;
}

function segmentTailToPath(segments: PathSegment[]): string {
  return segmentsToPath(segments).slice(1);
}

function filterOperandToString(op: FilterOperand): string {
  if (op.kind === 'current') return `@${segmentTailToPath(op.path)}`;
  if (op.kind === 'root') return `$${segmentTailToPath(op.path)}`;
  if (op.value === null) return 'null';
  if (typeof op.value === 'string') return JSON.stringify(op.value);
  return String(op.value);
}

export function filterNodeToString(node: FilterNode): string {
  switch (node.kind) {
    case 'comparison':
      return `${filterOperandToString(node.left)} ${node.op} ${filterOperandToString(node.right)}`;
    case 'and':
      return node.items.map(filterNodeToString).join(' && ');
    case 'or':
      return node.items.map(filterNodeToString).join(' || ');
    case 'exists':
      return filterOperandToString(node.operand);
    case 'regex':
      return `${filterOperandToString(node.operand)} =~ /${node.pattern}/${node.flags}`;
  }
}

/**
 * Parse a JSONPath query into segments. Returns a failure with a
 * human-readable error for malformed expressions.
 */
export function parseJsonPath(query: string): ParseResult {
  const text = query.trim();
  if (!text) return { ok: false, error: 'Enter a JSONPath query starting with $' };
  if (!text.startsWith('$')) {
    return { ok: false, error: 'Query must start with $ (e.g. $.users[*].name)' };
  }
  try {
    const parser = new PathParser(text);
    const segments = parser.parseAll();
    return { ok: true, segments };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

class PathParser {
  private pos = 0;
  constructor(private readonly text: string) {}

  private peek(): string {
    return this.text[this.pos] ?? '';
  }

  private expect(char: string): void {
    if (this.peek() !== char) {
      throw new Error(`Expected '${char}' at position ${this.pos} in "${this.text}"`);
    }
    this.pos++;
  }

  parseAll(): PathSegment[] {
    this.expect('$');
    const segments: PathSegment[] = [];
    while (this.pos < this.text.length) {
      const char = this.peek();
      if (char === '.') {
        this.pos++;
        if (this.peek() === '.') {
          this.pos++;
          segments.push(this.parseDescendant());
        } else if (this.peek() === '*') {
          this.pos++;
          segments.push({ kind: 'wildcard' });
        } else if (this.peek() === '[') {
          segments.push(this.parseBracket());
        } else {
          segments.push(this.parseName());
        }
      } else if (char === '[') {
        segments.push(this.parseBracket());
      } else {
        throw new Error(`Unexpected character '${char}' at position ${this.pos}`);
      }
    }
    return segments;
  }

  private parseName(): PathSegment {
    const start = this.pos;
    while (this.pos < this.text.length && /[A-Za-z0-9_$]/.test(this.peek())) this.pos++;
    if (start === this.pos) {
      throw new Error(`Expected a property name at position ${this.pos}`);
    }
    return { kind: 'child', names: [this.text.slice(start, this.pos)] };
  }

  private parseDescendant(): PathSegment {
    if (this.peek() === '*') {
      this.pos++;
      return { kind: 'descendant', then: null };
    }
    if (this.peek() === '[') {
      const inner = this.parseBracket();
      return { kind: 'descendant', then: [inner] };
    }
    const name = this.parseName();
    return { kind: 'descendant', then: [name] };
  }

  private parseBracket(): PathSegment {
    this.expect('[');
    this.skipWs();
    if (this.peek() === '*') {
      this.pos++;
      this.skipWs();
      this.expect(']');
      return { kind: 'wildcard' };
    }
    if (this.peek() === '?') {
      const segment = this.parseFilterBracket();
      this.skipWs();
      this.expect(']');
      return segment;
    }
    // union of quoted names, numeric indices, or a slice
    const tokens = this.parseBracketTokens();
    if (tokens.kind === 'slice') return tokens.slice;
    if (tokens.kind === 'index') return { kind: 'index', index: tokens.index };
    return { kind: 'child', names: (tokens as { names: string[] }).names };
  }

  private parseFilterBracket(): PathSegment {
    this.expect('?');
    this.skipWs();
    this.expect('(');
    const filterParser = new FilterParser(this.text, this.pos);
    const expression = filterParser.parseExpression();
    this.pos = filterParser.getPos();
    this.skipWs();
    this.expect(')');
    return { kind: 'filter', expression };
  }

  private skipWs(): void {
    while (/[ \t]/.test(this.peek())) this.pos++;
  }

  private parseBracketTokens():
    | { kind: 'slice'; slice: PathSegment }
    | { kind: 'index'; index: number }
    | { kind: 'names'; names: string[] } {
    const items: string[] = [];
    let sliceParts: string[] | null = null;
    const sliceChars = /[0-9:+-]/;
    while (true) {
      this.skipWs();
      const char = this.peek();
      if (char === '"' || char === "'") {
        items.push(this.parseQuoted());
      } else if (char === ':') {
        sliceParts = ['', ''];
        const start = this.pos;
        while (this.pos < this.text.length && sliceChars.test(this.peek())) this.pos++;
        const token = this.text.slice(start, this.pos).trim();
        sliceParts = token.split(':');
        break;
      } else if (/[0-9+-]/.test(char)) {
        const start = this.pos;
        while (this.pos < this.text.length && sliceChars.test(this.peek())) this.pos++;
        const token = this.text.slice(start, this.pos).trim();
        if (token.includes(':')) {
          sliceParts = token.split(':');
          break;
        }
        items.push(token);
      } else {
        throw new Error(`Unexpected token '${char}' in bracket at position ${this.pos}`);
      }
      this.skipWs();
      if (this.peek() === ',') {
        this.pos++;
        if (sliceParts) throw new Error('Unexpected comma inside slice');
        continue;
      }
      if (this.peek() === ':') {
        const start = this.pos;
        while (this.pos < this.text.length && sliceChars.test(this.peek())) this.pos++;
        const rest = this.text.slice(start, this.pos).trim().split(':').filter(Boolean);
        sliceParts = [items.pop() ?? '', ...rest];
        break;
      }
      break;
    }
    this.skipWs();
    this.expect(']');
    if (sliceParts) {
      const intOrNull = (raw: string): number | null => {
        if (raw === '' || raw === undefined) return null;
        const value = Number(raw);
        if (!Number.isFinite(value)) throw new Error(`Invalid slice bound "${raw}"`);
        return value;
      };
      const stepRaw = sliceParts[2] ?? '1';
      const step = intOrNull(stepRaw) ?? 1;
      if (step === 0) throw new Error('Slice step cannot be 0');
      return {
        kind: 'slice',
        slice: {
          kind: 'slice',
          start: intOrNull(sliceParts[0] ?? ''),
          end: intOrNull(sliceParts[1] ?? ''),
          step,
        },
      };
    }
    if (items.length === 0) throw new Error('Empty bracket selector');
    if (items.length === 1 && /^-?\d+$/.test(items[0] ?? '')) {
      return { kind: 'index', index: Number(items[0]!) };
    }
    return { kind: 'names', names: items };
  }

  private parseQuoted(): string {
    const quote = this.expectAnyQuote();
    let out = '';
    while (this.pos < this.text.length) {
      const char = this.text[this.pos];
      if (char === '\\') {
        const next = this.text[this.pos + 1];
        if (next === quote || next === '\\') {
          out += next;
          this.pos += 2;
          continue;
        }
        out += char;
        this.pos++;
        continue;
      }
      if (char === quote) {
        this.pos++;
        return out;
      }
      out += char;
      this.pos++;
    }
    throw new Error(`Unterminated string in query`);
  }

  private expectAnyQuote(): string {
    const char = this.peek();
    if (char !== '"' && char !== "'") {
      throw new Error(`Expected a quoted string at position ${this.pos}`);
    }
    this.pos++;
    return char;
  }

  // shared low-level helpers for the filter sub-parser
  static readIdentifier(text: string, pos: number): { value: string; next: number } {
    let i = pos;
    while (i < text.length && /[A-Za-z0-9_$]/.test(text[i] ?? '')) i++;
    return { value: text.slice(pos, i), next: i };
  }
}

class FilterParser {
  private sharedPos: number;
  constructor(
    private readonly text: string,
    startedPos: number
  ) {
    this.sharedPos = startedPos;
  }

  private skipWs(): void {
    while (/[ \t]/.test(this.text[this.sharedPos] ?? '')) this.sharedPos++;
  }
  private bump(): void {
    this.sharedPos++;
  }

  parseExpression(): FilterNode {
    const left = this.parseOr();
    return left;
  }

  private at(end: string): boolean {
    return this.text[this.sharedPos] === end;
  }

  getPos(): number {
    return this.sharedPos;
  }

  private parseOr(): FilterNode {
    const items = [this.parseAnd()];
    while (true) {
      this.skipWs();
      if (this.matchWord('||') || this.matchWord('or')) {
        this.skipWs();
        items.push(this.parseAnd());
        continue;
      }
      break;
    }
    if (items.length === 1) return items[0]!;
    return { kind: 'or', items };
  }

  private parseAnd(): FilterNode {
    const items = [this.parseUnary()];
    while (true) {
      this.skipWs();
      if (this.matchWord('&&') || this.matchWord('and')) {
        this.skipWs();
        items.push(this.parseUnary());
        continue;
      }
      break;
    }
    if (items.length === 1) return items[0]!;
    return { kind: 'and', items };
  }

  private matchWord(word: string): boolean {
    if (this.text.startsWith(word, this.sharedPos)) {
      this.sharedPos += word.length;
      return true;
    }
    return false;
  }

  private parseUnary(): FilterNode {
    this.skipWs();
    if (this.at('(')) {
      this.bump();
      const inner = this.parseOr();
      this.skipWs();
      if (!this.at(')')) throw new Error("Missing ')' in filter expression");
      this.bump();
      return inner;
    }
    const left = this.parseOperand();
    this.skipWs();
    for (const op of ['==', '!=', '<=', '>=', '<', '>'] as const) {
      if (this.matchWord(op)) {
        this.skipWs();
        const right = this.parseOperand();
        return { kind: 'comparison', left, op, right };
      }
    }
    if (this.matchWord('=~')) {
      this.skipWs();
      return this.parseRegex(left);
    }
    return { kind: 'exists', operand: left };
  }

  private parseRegex(left: FilterOperand): FilterNode {
    if (this.text[this.sharedPos] !== '/') throw new Error("Expected /regex/ after '=~'");
    this.bump();
    let pattern = '';
    let flags = '';
    while (this.sharedPos < this.text.length && this.text[this.sharedPos] !== '/') {
      pattern += this.text[this.sharedPos];
      this.bump();
    }
    if (this.text[this.sharedPos] !== '/') throw new Error('Unterminated regex literal in filter');
    this.bump();
    while (/[gimsuy]/.test(this.text[this.sharedPos] ?? '')) {
      flags += this.text[this.sharedPos];
      this.bump();
    }
    return { kind: 'regex', operand: left, pattern, flags };
  }

  private parseOperand(): FilterOperand {
    this.skipWs();
    const char = this.text[this.sharedPos];
    if (char === '@') {
      this.bump();
      const path = this.parseRelativePath();
      return { kind: 'current', path, raw: this.text.slice(this.sharedPos) };
    }
    if (char === '$') {
      this.bump();
      const path = this.parseRelativePath();
      return { kind: 'root', path, raw: this.text.slice(this.sharedPos) };
    }
    if (char === '"' || char === "'") {
      const value = this.parseQuotedLiteral();
      return { kind: 'literal', value };
    }
    const start = this.sharedPos;
    while (
      this.sharedPos < this.text.length &&
      /[0-9a-zA-Z_.+-]/.test(this.text[this.sharedPos] ?? '')
    ) {
      this.bump();
    }
    const token = this.text.slice(start, this.sharedPos).trim();
    if (token === 'true') return { kind: 'literal', value: true };
    if (token === 'false') return { kind: 'literal', value: false };
    if (token === 'null') return { kind: 'literal', value: null };
    const numeric = Number(token);
    if (token !== '' && Number.isFinite(numeric)) return { kind: 'literal', value: numeric };
    throw new Error(`Invalid filter operand "${token}"`);
  }

  private parseQuotedLiteral(): string {
    const quote = this.text[this.sharedPos];
    this.bump();
    let out = '';
    while (this.sharedPos < this.text.length) {
      const char = this.text[this.sharedPos];
      if (char === '\\') {
        out += this.text[this.sharedPos + 1] ?? '';
        this.sharedPos += 2;
        continue;
      }
      if (char === quote) {
        this.bump();
        return out;
      }
      out += char;
      this.bump();
    }
    throw new Error('Unterminated string in filter expression');
  }

  private parseRelativePath(): PathSegment[] {
    const segments: PathSegment[] = [];
    while (true) {
      const char = this.text[this.sharedPos];
      if (char === '.') {
        this.bump();
        if (this.text[this.sharedPos] === '.') {
          this.bump();
          this.skipWs();
          const name = PathParser.readIdentifier(this.text, this.sharedPos);
          if (name.next === this.sharedPos) throw new Error('Expected property name after ..');
          this.sharedPos = name.next;
          segments.push({ kind: 'descendant', then: [{ kind: 'child', names: [name.value] }] });
          continue;
        }
        const name = PathParser.readIdentifier(this.text, this.sharedPos);
        if (name.next === this.sharedPos) throw new Error('Expected property name after .');
        this.sharedPos = name.next;
        segments.push({ kind: 'child', names: [name.value] });
        continue;
      }
      if (char === '[') {
        this.bump();
        this.skipWs();
        const quote = this.text[this.sharedPos];
        if (quote === '"' || quote === "'") {
          this.bump();
          let name = '';
          while (this.sharedPos < this.text.length && this.text[this.sharedPos] !== quote) {
            name += this.text[this.sharedPos];
            this.bump();
          }
          if (this.text[this.sharedPos] !== quote)
            throw new Error('Unterminated quoted name in filter path');
          this.bump();
          this.skipWs();
          if (this.text[this.sharedPos] !== ']') throw new Error("Missing ']' in filter path");
          this.bump();
          segments.push({ kind: 'child', names: [name] });
          continue;
        }
        const start = this.sharedPos;
        while (this.sharedPos < this.text.length && /[0-9]/.test(this.text[this.sharedPos] ?? ''))
          this.bump();
        const token = this.text.slice(start, this.sharedPos);
        this.skipWs();
        if (this.text[this.sharedPos] !== ']') throw new Error("Missing ']' in filter path");
        this.bump();
        if (token === '') throw new Error('Empty bracket selector in filter path');
        segments.push({ kind: 'index', index: Number(token) });
        continue;
      }
      break;
    }
    return segments;
  }
}

/** Compare two JSON values with == semantics (loose deep equality for primitives). */
export function compareFilterValues(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a) === String(b);
}

function orderCompare(a: unknown, b: unknown): number | null {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return null;
}

function evaluateFilterOperand(
  operand: FilterOperand,
  currentValue: unknown,
  rootValue: unknown
): unknown {
  if (operand.kind === 'literal') return operand.value;
  const base = operand.kind === 'root' ? rootValue : currentValue;
  let nodes: unknown[] = [base];
  for (const segment of operand.path) {
    nodes = applySegment(nodes, segment, rootValue, operand.kind === 'root' ? '$' : '@');
    if (nodes.length === 0) return undefined;
  }
  return nodes.length === 1 ? nodes[0] : nodes;
}

function evaluateFilter(node: FilterNode, currentValue: unknown, rootValue: unknown): boolean {
  switch (node.kind) {
    case 'and':
      return node.items.every((item) => evaluateFilter(item, currentValue, rootValue));
    case 'or':
      return node.items.some((item) => evaluateFilter(item, currentValue, rootValue));
    case 'exists': {
      const value = evaluateFilterOperand(node.operand, currentValue, rootValue);
      return Array.isArray(value) ? value.length > 0 : value !== undefined;
    }
    case 'regex': {
      const value = evaluateFilterOperand(node.operand, currentValue, rootValue);
      if (typeof value !== 'string') return false;
      try {
        return new RegExp(node.pattern, node.flags).test(value);
      } catch {
        return false;
      }
    }
    case 'comparison': {
      const leftNode = evaluateFilterOperand(node.left, currentValue, rootValue);
      const rightNode = evaluateFilterOperand(node.right, currentValue, rootValue);
      const lefts = Array.isArray(leftNode) ? leftNode : [leftNode];
      const rights = Array.isArray(rightNode) ? rightNode : [rightNode];
      if (node.op === '==' || node.op === '!=') {
        const matched = lefts.some((l) => rights.some((r) => compareFilterValues(l, r)));
        return node.op === '==' ? matched : !matched;
      }
      return lefts.some((l) =>
        rights.some((r) => {
          const order = orderCompare(l, r);
          if (order === null) return false;
          switch (node.op) {
            case '<':
              return order < 0;
            case '<=':
              return order <= 0;
            case '>':
              return order > 0;
            case '>=':
              return order >= 0;
            default:
              return false;
          }
        })
      );
    }
  }
}

/** Apply one segment to a list of candidate nodes, collecting all matches. */
export function applySegment(
  nodes: unknown[],
  segment: PathSegment,
  rootValue: unknown,
  _origin: string
): unknown[] {
  const out: unknown[] = [];
  for (const node of nodes) {
    switch (segment.kind) {
      case 'child': {
        if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
          const record = node as Record<string, unknown>;
          for (const name of segment.names) {
            if (name in record) out.push(record[name]);
          }
        }
        break;
      }
      case 'index': {
        if (Array.isArray(node)) {
          const idx = segment.index < 0 ? node.length + segment.index : segment.index;
          if (idx >= 0 && idx < node.length) out.push(node[idx]);
        }
        break;
      }
      case 'wildcard': {
        if (Array.isArray(node)) out.push(...node);
        else if (node !== null && typeof node === 'object') out.push(...Object.values(node));
        break;
      }
      case 'descendant': {
        collectDescendants(node, out);
        if (segment.then && segment.then.length > 0) {
          const inner = applySegment(out, segment.then[0]!, rootValue, _origin);
          out.length = 0;
          out.push(...inner);
        }
        break;
      }
      case 'slice': {
        if (Array.isArray(node)) {
          const length = node.length;
          const step = segment.step;
          let start = segment.start === null ? (step > 0 ? 0 : length - 1) : segment.start;
          if (start < 0) start += length;
          let end = segment.end === null ? (step > 0 ? length : -1) : segment.end;
          if (end! < 0) end = end! + length;
          if (step > 0) {
            for (let i = Math.max(0, start); i < Math.min(end!, length); i += step)
              out.push(node[i]);
          } else {
            for (let i = Math.min(end! >= 0 ? end! : length - 1, length - 1); i > start; i += step)
              out.push(node[i]);
          }
        }
        break;
      }
      case 'filter': {
        if (Array.isArray(node)) {
          for (const item of node) {
            if (evaluateFilter(segment.expression, item, rootValue)) out.push(item);
          }
        } else if (node !== null && typeof node === 'object') {
          for (const value of Object.values(node)) {
            if (evaluateFilter(segment.expression, value, rootValue)) out.push(value);
          }
        }
        break;
      }
    }
  }
  return out;
}

function collectDescendants(node: unknown, out: unknown[]): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      out.push(item);
      collectDescendants(item, out);
    }
  } else if (node !== null && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      out.push(value);
      collectDescendants(value, out);
    }
  }
}

/** Run a parsed query against a document and collect matches with their paths. */
export function runParsedPath(segments: PathSegment[], doc: unknown): JsonPathMatch[] {
  type Work = { value: unknown; path: string; segments: PathSegment[] };
  let work: Work[] = [{ value: doc, path: '$', segments }];
  const matches: JsonPathMatch[] = [];
  while (work.length > 0) {
    const next: Work[] = [];
    for (const item of work) {
      if (item.segments.length === 0) {
        matches.push({ path: item.path, value: item.value });
        continue;
      }
      const head = item.segments[0];
      if (head === undefined) {
        matches.push({ path: item.path, value: item.value });
        continue;
      }
      const rest = item.segments.slice(1);
      const children = applySegment([item.value], head, doc, '$');
      for (const child of children) {
        let path: string;
        if (head.kind === 'index') {
          path = `${item.path}[${head.index}]`;
        } else if (head.kind === 'child' && head.names.length === 1) {
          path = `${item.path}${quoteIfNeeded(head.names[0] ?? '')}`;
        } else if (head.kind === 'descendant') {
          const tail = segmentsToPath([head]).slice(1);
          path = `${item.path}${tail}`;
        } else {
          path = `${item.path}${segmentsToPath([head]).slice(1)}`;
        }
        next.push({ value: child, path, segments: rest });
      }
    }
    work = next;
  }
  return matches;
}

/** Build a display path for a match that respects the query structure. */
export function runQuery(query: string, doc: unknown): QueryResult {
  const parsed = parseJsonPath(query);
  if (!parsed.ok) return { matches: [], error: parsed.error };
  try {
    return { matches: runParsedPath(parsed.segments, doc), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { matches: [], error: `Query failed: ${message}` };
  }
}

/** Parse raw JSON text into a document plus error reporting for malformed input. */
export function parseJsonInput(text: string): { doc: unknown | null; error: string | null } {
  if (!text.trim()) return { doc: null, error: 'JSON input is empty' };
  try {
    return { doc: JSON.parse(text), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { doc: null, error: `Invalid JSON: ${message}` };
  }
}

/** Build the JSONPath string for a key chain rooted at $. */
export function buildPath(chain: Array<{ key: string; isIndex: boolean }>): string {
  let out = '$';
  chain.forEach((link, i) => {
    if (link.isIndex || /^-?\d+$/.test(link.key)) {
      if (i === 0) out += `.${link.key}`;
      else out += `[${link.key}]`;
    } else if (IDENTIFIER_RE.test(link.key)) {
      out += `.${link.key}`;
    } else {
      out += `.${JSON.stringify(link.key)}`;
    }
  });
  return out;
}

/** Build a renderable tree from a parsed JSON document. */
export function buildJsonTree(doc: unknown): JsonTreeNode {
  const nodeValueToType = (value: unknown): JsonTreeNode['type'] => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    switch (typeof value) {
      case 'object':
        return 'object';
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      default:
        return 'null';
    }
  };

  const build = (
    value: unknown,
    key: string,
    chain: Array<{ key: string; isIndex: boolean }>
  ): JsonTreeNode => {
    const path = buildPath(chain);
    const children: JsonTreeNode[] = [];
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        children.push(
          build(item, String(index), [...chain, { key: String(index), isIndex: true }])
        );
      });
    } else if (value !== null && typeof value === 'object') {
      for (const [name, childValue] of Object.entries(value as Record<string, unknown>)) {
        children.push(build(childValue, name, [...chain, { key: name, isIndex: false }]));
      }
    }
    return { key, path, value, children, type: nodeValueToType(value) };
  };

  return build(doc, 'root', []);
}

/** Short preview of a value for result lists (strings truncated, objects summarized). */
export function previewValue(value: unknown, maxLength = 80): string {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    const quoted = JSON.stringify(value);
    return quoted.length > maxLength ? `${quoted.slice(0, maxLength - 1)}…` : quoted;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const short = JSON.stringify(value);
    return short.length > maxLength
      ? `${short.slice(0, maxLength - 1)}… (${value.length} items)`
      : short;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    const short = JSON.stringify(value);
    return short.length > maxLength
      ? `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''} }`
      : short;
  }
  return String(value);
}
