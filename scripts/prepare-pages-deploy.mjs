import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PUBLIC_ENTRIES = [
  'index.html',
  'privacy.html',
  'vote.html',
  'vote-admin.html',
  '404.html',
  '_redirects',
  'robots.txt',
  'sitemap.xml',
  'css',
  'data',
  'en',
  'favicon',
  'functions',
  'img',
  'js',
];

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function assertSafeOutDir(rootDir, outDir) {
  const root = resolve(rootDir);
  const out = resolve(outDir);
  if (out === root) {
    throw new Error('Refusing to use the project root as the deploy output directory');
  }
  if (!out.startsWith(root + '\\') && !out.startsWith(root + '/')) {
    throw new Error('Deploy output directory must be inside the project root');
  }
}

export async function preparePagesDeploy({
  rootDir = process.cwd(),
  outDir = join(rootDir, '.deploy', 'pages'),
} = {}) {
  assertSafeOutDir(rootDir, outDir);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const copied = [];
  for (const entry of PUBLIC_ENTRIES) {
    const src = join(rootDir, entry);
    if (!(await pathExists(src))) continue;
    await cp(src, join(outDir, entry), { recursive: true, force: true });
    copied.push(entry);
  }

  return { outDir: resolve(outDir), copied };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { outDir, copied } = await preparePagesDeploy();
  console.log(`Prepared ${outDir}`);
  console.log(`Copied ${copied.join(', ')}`);
}
