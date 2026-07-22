import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const repositoryRoot = new URL('..', import.meta.url);

function json(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, repositoryRoot), 'utf8'));
}

function source(relativePath) {
  return readFileSync(new URL(relativePath, repositoryRoot), 'utf8');
}

function filesUnder(relativePath) {
  const root = fileURLToPath(new URL(relativePath, repositoryRoot));
  const results = [];

  function visit(path) {
    for (const entry of readdirSync(path)) {
      const child = join(path, entry);
      if (statSync(child).isDirectory()) visit(child);
      else results.push(child);
    }
  }

  visit(root);
  return results;
}

const packageJson = json('package.json');
const packageLock = json('package-lock.json');
const lockRoot = packageLock.packages?.[''];

assert.ok(lockRoot, 'package-lock.json must contain a root package entry');
assert.deepEqual(
  lockRoot.dependencies ?? {},
  packageJson.dependencies ?? {},
  'package.json runtime dependencies and package-lock root dependencies must match'
);
assert.deepEqual(
  lockRoot.devDependencies ?? {},
  packageJson.devDependencies ?? {},
  'package.json devDependencies and package-lock root devDependencies must match'
);

for (const dependency of ['express-rate-limit', 'morgan']) {
  assert.equal(
    packageJson.dependencies?.[dependency],
    undefined,
    `${dependency} is superseded by the repository-native infrastructure implementation`
  );
  assert.equal(
    packageLock.packages?.[`node_modules/${dependency}`],
    undefined,
    `${dependency} must not remain in the lockfile`
  );
}
assert.equal(packageJson.devDependencies?.['@types/morgan'], undefined);
assert.equal(packageLock.packages?.['node_modules/@types/morgan'], undefined);

for (const app of ['admin_panel', 'company_dashboard', 'qr_kiosk']) {
  const appPackage = json(`apps/${app}/package.json`);
  const appLock = json(`apps/${app}/package-lock.json`);
  const appLockRoot = appLock.packages?.[''];
  assert.ok(appLockRoot, `${app} lockfile must contain a root package entry`);
  assert.deepEqual(
    appLockRoot.dependencies ?? {},
    appPackage.dependencies ?? {},
    `${app} runtime dependencies and lockfile must match`
  );
  assert.deepEqual(
    appLockRoot.devDependencies ?? {},
    appPackage.devDependencies ?? {},
    `${app} devDependencies and lockfile must match`
  );
}

const legacyImportPattern =
  /(?:from\s+['"](?:morgan|express-rate-limit)['"]|require\(\s*['"](?:morgan|express-rate-limit)['"]\s*\))/;
for (const relativeRoot of ['src', 'scripts']) {
  for (const file of filesUnder(relativeRoot)) {
    if (!/\.(?:cjs|js|mjs|ts)$/.test(file)) continue;
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      legacyImportPattern,
      `legacy dependency import remains in ${file}`
    );
  }
}

const tsconfig = json('tsconfig.json');
assert.equal(tsconfig.compilerOptions?.sourceMap, false);
assert.equal(tsconfig.compilerOptions?.inlineSourceMap ?? false, false);
assert.equal(tsconfig.compilerOptions?.declarationMap ?? false, false);
assert.equal(tsconfig.compilerOptions?.noEmitOnError, true);

for (const viteConfig of [
  'apps/admin_panel/vite.config.ts',
  'apps/company_dashboard/vite.config.ts',
  'apps/qr_kiosk/vite.config.ts',
]) {
  assert.match(source(viteConfig), /sourcemap:\s*false/);
}

const workflow = loadYaml(source('.github/workflows/ci.yml'));
const backendJob = workflow?.jobs?.backend;
const productionEnvStep = backendJob?.steps?.find(
  (step) => step?.name === 'Production env validation'
);
assert.ok(productionEnvStep?.env, 'CI must have a production environment validation step');

const requiredProcessEnv = Object.fromEntries(
  ['SystemRoot', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'HOME'].flatMap((key) =>
    process.env[key] === undefined ? [] : [[key, process.env[key]]]
  )
);
const envValidation = spawnSync(
  process.execPath,
  [
    '-r',
    'ts-node/register',
    '-e',
    "require('./src/lib/check-env').checkEnv()",
  ],
  {
    cwd: fileURLToPath(repositoryRoot),
    encoding: 'utf8',
    env: {
      ...requiredProcessEnv,
      ...(backendJob.env ?? {}),
      ...productionEnvStep.env,
    },
  }
);
assert.equal(
  envValidation.status,
  0,
  `CI production environment validation fails:\n${
    envValidation.error?.message || envValidation.stderr || envValidation.stdout
  }`
);

assert.ok(process.env.npm_execpath, 'npm_execpath is required to verify the installed tree');
const dependencyTree = spawnSync(
  process.execPath,
  [process.env.npm_execpath, 'ls', '--depth=0', '--offline', '--json'],
  {
    cwd: fileURLToPath(repositoryRoot),
    encoding: 'utf8',
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' },
  }
);
assert.equal(
  dependencyTree.status,
  0,
  `installed root dependency tree is not clean:\n${
    dependencyTree.error?.message || dependencyTree.stderr || dependencyTree.stdout
  }`
);
const dependencyTreeJson = JSON.parse(dependencyTree.stdout);
// npm 10 can install the transitive WASM fallback of a platform-filtered
// optional sharp package while pruning the optional parent. `npm ls` then
// reports the two lockfile-pinned children as root-level extraneous packages.
// Keep this exception exact and prove both artifacts are optional lock entries;
// every other unexpected package still fails the release gate.
const npmOptionalInstallerArtifacts = new Map([
  ['@img/sharp-wasm32', '0.35.3'],
  ['@emnapi/runtime', '1.11.2'],
]);
for (const [name, version] of npmOptionalInstallerArtifacts) {
  const lockEntry = packageLock.packages?.[`node_modules/${name}`];
  assert.equal(lockEntry?.optional, true, `${name} must remain an optional lockfile artifact`);
  assert.equal(lockEntry?.version, version, `${name} optional artifact version changed`);
  assert.equal(
    packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name],
    undefined,
    `${name} must not become a direct dependency`
  );
}
const unexpectedDependencyProblems = (dependencyTreeJson.problems ?? []).filter(
  (problem) =>
    ![...npmOptionalInstallerArtifacts].some(
      ([name, version]) => problem.startsWith(`extraneous: ${name}@${version} `)
    )
);
assert.deepEqual(unexpectedDependencyProblems, []);

const [{ default: sharp }, { PDFDocument }, { default: multer }] = await Promise.all([
  import('sharp'),
  import('pdf-lib'),
  import('multer'),
]);
const imageBytes = await sharp({
  create: {
    width: 1,
    height: 1,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
}).png().toBuffer();
assert.ok(imageBytes.length > 0, 'sharp must load its platform runtime and encode an image');

const document = await PDFDocument.create();
document.addPage([1, 1]);
assert.ok((await document.save()).length > 0, 'pdf-lib must create a document');
assert.equal(typeof multer, 'function', 'multer runtime export must be available');

console.log('dependency and source-map policy regression tests passed');
