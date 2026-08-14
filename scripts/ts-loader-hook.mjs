// Node module customization hook (core API, zero dependencies) used ONLY
// for local `node --test` execution of src/lib/aiBrain's suite.
//
// Why this exists: src/lib/aiBrain's internal relative imports use a .js
// extension in the source .ts files (e.g. `from '../tools.js'`), which is
// the standard TypeScript Node16/NodeNext convention -- required because
// Vercel's Node.js function builder compiles each reachable .ts file to a
// sibling .js file but does NOT rewrite import specifier strings, so at
// runtime only a literal .js-suffixed specifier resolves correctly against
// the deployed output (confirmed by three rounds of live
// ERR_MODULE_NOT_FOUND debugging against a real Vercel deployment).
//
// Locally, there is no compiled .js output -- only the real .ts files on
// disk -- and Node's native TypeScript support (used by `node --test`)
// does not fall back from a .js specifier to a sibling .ts file the way
// bundler-style resolvers (webpack/esbuild/vite) do. This hook adds
// exactly that one fallback, and nothing else: if a relative specifier
// ending in .js fails to resolve, retry the same path with .ts instead.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && specifier.endsWith('.js')) {
    const candidateUrl = new URL(specifier, context.parentURL);
    const candidatePath = fileURLToPath(candidateUrl);
    if (!existsSync(candidatePath)) {
      const tsPath = candidatePath.slice(0, -'.js'.length) + '.ts';
      if (existsSync(tsPath)) {
        return nextResolve(specifier.slice(0, -'.js'.length) + '.ts', context);
      }
    }
  }
  return nextResolve(specifier, context);
}
