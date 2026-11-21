import type { ToolConfig } from '@itsjust/core';
import packageJson from '../../package.json';

export const templateBaseVersion = packageJson.version;

const toolConfig: ToolConfig = {
  id: 'tool-1795269875',
  name: 'JSONPath Query Explorer',
  description:
    'Run JSONPath queries against arbitrary JSON and see results highlighted in the source tree with path suggestions, error reporting, sample datasets and shareable sessions.',
  version: '1.0.0',
  exportFormats: ['png', 'jpeg', 'webp', 'pdf'],
  features: {
    export: true,
    autoSave: true,
    undoRedo: false,
    sidebar: true,
    statusBar: true,
    darkMode: true,
  },
  theme: {
    accent: '#0ea5e9',
    accentHover: '#0284c9',
    accentSubtle: 'rgba(14, 165, 233, 0.08)',
    brand: 'JSONPath Explorer',
    icon: '🔎',
  },
  shortcuts: [
    {
      title: 'Query',
      shortcuts: [
        {
          label: 'Run query',
          keys: 'Mod+Enter',
          description: 'Evaluate the current JSONPath against the JSON input',
        },
        {
          label: 'Clear query',
          keys: 'Mod+Shift+X',
          description: 'Clear the query box',
        },
      ],
    },
    {
      title: 'Data',
      shortcuts: [
        {
          label: 'Load sample data',
          keys: 'Mod+Shift+L',
          description: 'Cycle through the built-in sample datasets',
        },
      ],
    },
  ],
};

export default toolConfig;
