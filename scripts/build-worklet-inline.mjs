import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const workletCode = readFileSync(resolve(root, 'dist', 'worklet.js'), 'utf-8');

const output = `// AUTO-GENERATED — do not edit. Run "npm run build:inline" to regenerate.
export const WORKLET_SOURCE = ${JSON.stringify(workletCode)};
`;

writeFileSync(resolve(root, 'src', 'worklet-inline.ts'), output, 'utf-8');
