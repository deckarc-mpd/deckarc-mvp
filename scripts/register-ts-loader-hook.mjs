// Registers ts-loader-hook.mjs via the current (non-deprecated) Node
// module customization hooks API. Passed to `node --import` by
// `npm run test:aibrain`. See ts-loader-hook.mjs for why this exists.
import { register } from 'node:module';

register('./ts-loader-hook.mjs', import.meta.url);
