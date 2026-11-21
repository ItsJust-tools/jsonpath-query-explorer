import type { Tool, DeserializeResult } from '@itsjust/core';
import toolConfig from './tool.config';
import { DEFAULT_STATE, type ToolState } from './types';

export const MAX_JSON_LENGTH = 2_000_000;
export const MAX_QUERY_LENGTH = 5_000;

export const jsonPathTool: Tool<ToolState> = {
  id: toolConfig.id,
  name: toolConfig.name,
  version: toolConfig.version,
  config: toolConfig,
  initialState: { ...DEFAULT_STATE },
  // exporters snapshot the rendered query results as an image or PDF.
  exporters: [
    { format: 'png', loader: () => import('./exporters/png') },
    { format: 'jpeg', loader: () => import('./exporters/jpeg') },
    { format: 'webp', loader: () => import('./exporters/webp') },
    { format: 'pdf', loader: () => import('./exporters/pdf') },
  ],
  serialize: (state) => JSON.stringify({ jsonInput: state.jsonInput, query: state.query }),
  deserialize: (data): DeserializeResult<ToolState> => {
    if (typeof data !== 'object' || data === null) {
      return {
        success: false,
        error: 'Invalid data format: expected JSONPath explorer state object',
      };
    }
    const v = data as Record<string, unknown>;
    if (typeof v.jsonInput !== 'string' || typeof v.query !== 'string') {
      return {
        success: false,
        error: 'Invalid data format: expected { jsonInput: string, query: string }',
      };
    }
    if (v.jsonInput.length > MAX_JSON_LENGTH || v.query.length > MAX_QUERY_LENGTH) {
      return { success: false, error: 'State payload exceeds maximum allowed size' };
    }
    return {
      success: true,
      data: { jsonInput: v.jsonInput, query: v.query },
    };
  },
};

export default jsonPathTool;
