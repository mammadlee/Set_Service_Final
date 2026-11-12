import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflowPath = '.github/workflows/publish-release-images.yml';
const workflow = readFileSync(workflowPath, 'utf8');
const checklist = readFileSync(
  'docs/immutable-image-publication-and-production-checklist.md',
  'utf8',
);

const triggerBlock = workflow.match(/^on:\r?\n([\s\S]*?)^permissions:/m)?.[1] ?? '';
assert.match(triggerBlock, /^  workflow_dispatch:/m);
for (const forbiddenTrigger of [
  'push',
  'pull_request',
  'schedule',
  'repository_dispatch',
  'workflow_call',
  'workflow_run',
  'release',
]) {
  assert.doesNotMatch(
    triggerBlock,
    new RegExp(`^  ${forbiddenTrigger}:`, 'm'),
    `publication workflow must not declare ${forbiddenTrigger}`,
  );
}

assert.match(workflow, /release_sha:[\s\S]*confirmation:/);
assert.match(workflow, /PUBLISH_SIGN_RELEASE_IMAGES/);
assert.match(workflow, /"\$RELEASE_SHA" != "\$GITHUB_SHA"/);
assert.match(workflow, /"\$GITHUB_REPOSITORY" != 'mammadlee\/Set_Service_Final'/);
assert.match(workflow, /"\$GITHUB_REF" != 'refs\/heads\/codex\/final-store-release-preparation'/);
assert.match(workflow, /npm run secrets:check/);
assert.match(workflow, /fetch-depth: 0/);
assert.match(workflow, /persist-credentials: false/g);
assert.doesNotMatch(workflow, /runs-on: ubuntu-latest/);
assert.match(workflow, /runs-on: ubuntu-24\.04/g);

for (const imageVariable of [
  'NODE_BASE_IMAGE',
  'RUNTIME_BASE_IMAGE',
  'POSTGRES_CI_IMAGE',
  'REDIS_CI_IMAGE',
]) {
  assert.ok(
    workflow.includes(`${imageVariable}: \${{ vars.${imageVariable} }}`),
    `missing immutable repository variable ${imageVariable}`,
  );
}

assert.match(workflow, /packages: write/);
assert.match(workflow, /id-token: write/);
assert.match(workflow, /docker login "\$REGISTRY"/);
assert.match(workflow, /--platform linux\/amd64/);
assert.match(workflow, /--provenance=mode=max/);
assert.match(workflow, /--sbom=true/);
assert.match(workflow, /\.Provenance\.SLSA/);
assert.match(workflow, /provenance\.json/);
assert.match(workflow, /-candidate-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/);
assert.match(workflow, /org\.opencontainers\.image\.revision=\$\{RELEASE_SHA\}/);
assert.match(workflow, /--scanners vuln,secret/);
assert.match(workflow, /--severity CRITICAL,HIGH/);
assert.match(workflow, /--ignore-unfixed=false/);
assert.match(workflow, /cosign sign --yes "\$IMMUTABLE_REF"/);
assert.match(workflow, /cosign verify[\s\S]*--certificate-identity/);
assert.match(workflow, /https:\/\/token\.actions\.githubusercontent\.com/);
for (const exactCertificateClaim of [
  '--certificate-github-workflow-repository "$GITHUB_REPOSITORY"',
  '--certificate-github-workflow-ref "$GITHUB_REF"',
  '--certificate-github-workflow-sha "$RELEASE_SHA"',
  '--certificate-github-workflow-trigger workflow_dispatch',
]) {
  assert.ok(
    workflow.includes(exactCertificateClaim),
    `missing exact Cosign certificate claim: ${exactCertificateClaim}`,
  );
}
assert.match(workflow, /cosign sign-blob --yes/);
assert.match(workflow, /release-manifest\.json/);
assert.match(workflow, /docker buildx imagetools create --tag "\$final_tag" "\$immutable_ref"/);
assert.match(workflow, /Immutable release tag already exists with a different digest/);
assert.match(workflow, /\.tag = \$tag/);
assert.match(
  workflow,
  /api_ref="\$\(jq -er 'select\(\.target == "api"\) \| \.immutable_ref' "\$\{fragments\[@\]\}"\)"/,
);
assert.match(
  workflow,
  /node scripts\/jwt-invalidator-container-regression\.mjs[\s\S]*"\$api_ref"[\s\S]*"\$migration_ref"[\s\S]*"\$POSTGRES_CI_IMAGE"/,
);
assert.ok(
  workflow.indexOf('node scripts/jwt-invalidator-container-regression.mjs') <
    workflow.indexOf('Promote verified digests to immutable release tags'),
  'JWT invalidator regression must pass before immutable release-tag promotion',
);
assert.match(
  workflow,
  /node scripts\/reviewer-provisioner-container-regression\.mjs[\s\S]*"\$POSTGRES_CI_IMAGE"/,
);
for (const approvedImage of [
  'node:24.22.0-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315',
  'gcr.io/distroless/nodejs24-debian13:nonroot@sha256:59c479c9b8c123e66047315c968aa2d35e31ae5149c856e4110a79c8b3563f0b',
  'postgres:16.15-bookworm@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4',
  'redis:7.4.10-alpine3.21@sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2',
]) {
  assert.ok(workflow.includes(`!= '${approvedImage}'`), `image is not exact-pinned: ${approvedImage}`);
}

const expectedTargets = [
  ['api', 'setservice-api'],
  ['outbox-worker', 'setservice-outbox'],
  ['migration', 'setservice-migration'],
  ['malware-scanner', 'setservice-malware-scanner'],
  ['reviewer-provisioner', 'setservice-reviewer-provisioner'],
];
for (const [target, repository] of expectedTargets) {
  assert.match(
    workflow,
    new RegExp(`target: ${target.replace('-', '\\-')}\\r?\\n\\s+repository: ${repository.replace('-', '\\-')}`),
    `missing immutable image target ${target}`,
  );
}

for (const forbiddenAction of [
  /\bssh\b/i,
  /deploy-production\.sh/i,
  /docker compose (?:up|run)/i,
  /bitrise/i,
  /app store connect/i,
  /google play/i,
  /kubectl/i,
]) {
  assert.doesNotMatch(workflow, forbiddenAction, 'publication workflow must not deploy or upload stores');
}

const usesLines = workflow
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith('uses: '));
assert.ok(usesLines.length > 0);
for (const line of usesLines) {
  assert.match(line, /^uses: [^@\s]+@[a-f0-9]{40}(?:\s+#.*)?$/);
}

assert.doesNotMatch(workflow, /:[ \t]*(?:latest|main)(?:\s|$)/m);
assert.doesNotMatch(workflow, /secrets\.(?!GITHUB_TOKEN)[A-Z0-9_]+/);

for (const requiredChecklistControl of [
  'config -q',
  '--no-deps --no-build',
  'repository@sha256:<digest>',
  'reviewer-provisioner',
  'active` or `unknown` identity blocks publication',
  'ClamAV, and Caddy remain untouched',
]) {
  assert.ok(
    checklist.includes(requiredChecklistControl),
    `missing production checklist control: ${requiredChecklistControl}`,
  );
}
assert.doesNotMatch(checklist, /docker compose down -v/i);

console.log('release publication workflow regression: OK');
