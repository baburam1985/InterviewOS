// Test-only loader: execute the real TypeScript routes with isolated auth/Workers bindings.
import {readFile, stat} from 'node:fs/promises';
import ts from 'typescript';

const mocks = new URL('./mocks.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return {url: mocks, shortCircuit: true};
  if (specifier.startsWith('.') && context.parentURL) {
    const target = new URL(specifier, context.parentURL);
    if (/\/app\/chatgpt-auth(?:\.ts)?$/.test(target.pathname)) return {url: mocks, shortCircuit: true};
    if (!/\.[a-z]+$/i.test(target.pathname)) {
      const typed = new URL(target.href + '.ts');
      if (await stat(typed).then(s => s.isFile()).catch(() => false)) {
        return {url: typed.href, shortCircuit: true};
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const source = await readFile(new URL(url), 'utf8');
    return {
      format: 'module',
      shortCircuit: true,
      source: ts.transpileModule(source, {
        compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
        fileName: new URL(url).pathname,
      }).outputText,
    };
  }
  return nextLoad(url, context);
}
