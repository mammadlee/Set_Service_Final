import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const HEX_DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const OCI_INDEX = 'application/vnd.oci.image.index.v1+json';
const OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json';
const OCI_EMPTY_CONFIG = 'application/vnd.oci.empty.v1+json';
const IN_TOTO_LAYER = 'application/vnd.in-toto+json';
const DOCKER_ATTESTATION = 'application/vnd.docker.attestation.manifest.v1+json';
const SLSA_V1 = 'https://slsa.dev/provenance/v1';
const SPDX_PREDICATE = 'https://spdx.dev/Document';
const BUILDKIT_SLSA_BUILD_TYPE =
  'https://github.com/moby/buildkit/blob/master/docs/attestations/slsa-definitions.md';

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, field) {
  if (!isRecord(value)) fail(`${field} must be an object`);
  return value;
}

function requireString(value, field, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    fail(`${field} must be ${allowEmpty ? 'a string' : 'a non-empty string'}`);
  }
  return value;
}

function requireDigest(value, field) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    fail(`${field} must be an immutable sha256 digest`);
  }
  return value;
}

function requireSingle(values, field) {
  if (values.length !== 1) fail(`${field} must contain exactly one entry`);
  return values[0];
}

function requireExact(value, expected, field) {
  if (value !== expected) fail(`${field} does not match the approved release context`);
}

function requireTimestamp(value, field) {
  requireString(value, field);
  if (Number.isNaN(Date.parse(value))) fail(`${field} must be a valid timestamp`);
}

function validateResolvedDependencies(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('predicate.buildDefinition.resolvedDependencies must be non-empty');
  }

  const sha256Digests = new Set();
  for (const dependency of value) {
    const item = requireRecord(dependency, 'resolved dependency');
    requireString(item.uri, 'resolved dependency uri');
    const digest = requireRecord(item.digest, 'resolved dependency digest');
    const entries = Object.entries(digest);
    if (entries.length === 0) fail('resolved dependency digest must not be empty');
    for (const [algorithm, encoded] of entries) {
      if (!/^[a-z0-9][a-z0-9+._-]*$/.test(algorithm)) {
        fail('resolved dependency digest algorithm is invalid');
      }
      if (typeof encoded !== 'string' || !HEX_DIGEST_PATTERN.test(encoded)) {
        fail('resolved dependency digest value is invalid');
      }
      if (algorithm === 'sha256') sha256Digests.add(encoded);
    }
  }
  return sha256Digests;
}

function digestFromPinnedImage(image, field) {
  const match = /@sha256:([a-f0-9]{64})$/.exec(image);
  if (!match) fail(`${field} must be pinned by sha256 digest`);
  return match[1];
}

function validateSlsaV1Predicate(predicate, expected) {
  const body = requireRecord(predicate, 'SLSA predicate');
  const buildDefinition = requireRecord(
    body.buildDefinition,
    'predicate.buildDefinition',
  );
  const runDetails = requireRecord(body.runDetails, 'predicate.runDetails');

  requireExact(
    buildDefinition.buildType,
    BUILDKIT_SLSA_BUILD_TYPE,
    'predicate.buildDefinition.buildType',
  );
  const external = requireRecord(
    buildDefinition.externalParameters,
    'predicate.buildDefinition.externalParameters',
  );
  const configSource = requireRecord(
    external.configSource,
    'predicate.buildDefinition.externalParameters.configSource',
  );
  requireExact(
    configSource.path,
    'Dockerfile',
    'predicate.buildDefinition.externalParameters.configSource.path',
  );
  requireRecord(
    external.request,
    'predicate.buildDefinition.externalParameters.request',
  );
  const request = external.request;
  requireExact(request.frontend, 'dockerfile.v0', 'predicate build frontend');
  const requestArgs = requireRecord(request.args, 'predicate build request args');
  requireExact(requestArgs.target, expected.target, 'predicate build target');
  requireExact(
    requestArgs['build-arg:NODE_BASE_IMAGE'],
    expected.nodeBaseImage,
    'predicate Node base image',
  );
  requireExact(
    requestArgs['build-arg:RUNTIME_BASE_IMAGE'],
    expected.runtimeBaseImage,
    'predicate runtime base image',
  );
  requireExact(
    requestArgs['label:org.opencontainers.image.source'],
    `https://github.com/${expected.githubRepository}`,
    'predicate source label',
  );
  requireExact(
    requestArgs['label:org.opencontainers.image.revision'],
    expected.releaseSha,
    'predicate revision label',
  );

  const internal = requireRecord(
    buildDefinition.internalParameters,
    'predicate.buildDefinition.internalParameters',
  );
  requireExact(
    internal.github_repository,
    expected.githubRepository,
    'predicate source repository',
  );
  requireExact(
    internal.github_workflow_sha,
    expected.releaseSha,
    'predicate workflow SHA',
  );
  requireExact(internal.github_ref, expected.githubRef, 'predicate workflow ref');
  requireExact(
    internal.github_event_name,
    'workflow_dispatch',
    'predicate workflow event',
  );
  requireExact(
    internal.targetPlatform,
    'linux/amd64',
    'predicate target platform',
  );
  const resolvedDigests = validateResolvedDependencies(
    buildDefinition.resolvedDependencies,
  );
  for (const [image, field] of [
    [expected.nodeBaseImage, 'Node base image'],
    [expected.runtimeBaseImage, 'runtime base image'],
  ]) {
    if (!resolvedDigests.has(digestFromPinnedImage(image, field))) {
      fail(`${field} is missing from resolved dependencies`);
    }
  }

  const builder = requireRecord(runDetails.builder, 'predicate.runDetails.builder');
  // BuildKit v0.34.2 emits the required field as an empty string. Preserve
  // provider compatibility while still rejecting a missing or non-string id.
  requireString(builder.id, 'predicate.runDetails.builder.id', { allowEmpty: true });

  const metadata = requireRecord(
    runDetails.metadata,
    'predicate.runDetails.metadata',
  );
  requireString(metadata.invocationId, 'predicate metadata invocationId');
  requireTimestamp(metadata.startedOn, 'predicate metadata startedOn');
  requireTimestamp(metadata.finishedOn, 'predicate metadata finishedOn');
  const completeness = requireRecord(
    metadata.buildkit_completeness,
    'predicate metadata buildkit_completeness',
  );
  requireExact(completeness.request, true, 'predicate request completeness');
  requireExact(
    completeness.resolvedDependencies,
    false,
    'predicate dependency completeness marker',
  );
  return {
    request: completeness.request,
    resolvedDependencies: completeness.resolvedDependencies,
  };
}

export function validateBuildkitProvenance({
  index,
  attestationManifest,
  predicate,
  immutableRef,
  imageRepository,
  releaseSha,
  githubRepository,
  githubRef,
  target,
  nodeBaseImage,
  runtimeBaseImage,
}) {
  requireString(imageRepository, 'image repository');
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) fail('release SHA must be exact');
  requireString(githubRepository, 'GitHub repository');
  requireString(githubRef, 'GitHub ref');
  requireString(target, 'image target');
  requireString(nodeBaseImage, 'Node base image');
  requireString(runtimeBaseImage, 'runtime base image');

  const separator = immutableRef.lastIndexOf('@');
  if (separator <= 0) fail('immutable image reference is invalid');
  const imageName = immutableRef.slice(0, separator);
  const immutableDigest = requireDigest(
    immutableRef.slice(separator + 1),
    'immutable image reference digest',
  );
  if (!imageName.endsWith(`/${imageRepository}`)) {
    fail('immutable image reference repository is invalid');
  }

  const imageIndex = requireRecord(index, 'image index');
  requireExact(imageIndex.mediaType, OCI_INDEX, 'image index media type');
  requireExact(imageIndex.digest, immutableDigest, 'image index digest');
  if (!Array.isArray(imageIndex.manifests)) fail('image index manifests must be an array');

  const platformManifest = requireSingle(
    imageIndex.manifests.filter(
      (entry) =>
        isRecord(entry) &&
        entry.mediaType === OCI_MANIFEST &&
        entry.platform?.os === 'linux' &&
        entry.platform?.architecture === 'amd64' &&
        entry.annotations?.['vnd.docker.reference.type'] === undefined,
    ),
    'linux/amd64 image descriptor',
  );
  const platformDigest = requireDigest(
    platformManifest.digest,
    'linux/amd64 image manifest digest',
  );

  const attestationDescriptor = requireSingle(
    imageIndex.manifests.filter(
      (entry) =>
        isRecord(entry) &&
        entry.mediaType === OCI_MANIFEST &&
        entry.platform?.os === 'unknown' &&
        entry.platform?.architecture === 'unknown' &&
        entry.annotations?.['vnd.docker.reference.type'] === 'attestation-manifest',
    ),
    'attestation descriptor',
  );
  const attestationDigest = requireDigest(
    attestationDescriptor.digest,
    'attestation manifest digest',
  );
  requireExact(
    attestationDescriptor.annotations?.['vnd.docker.reference.digest'],
    platformDigest,
    'attestation subject reference',
  );
  if (imageIndex.manifests.length !== 2) {
    fail('image index must contain only the image and its attestation manifest');
  }

  const attestation = requireRecord(attestationManifest, 'attestation manifest');
  requireExact(attestation.mediaType, OCI_MANIFEST, 'attestation manifest media type');
  requireExact(attestation.artifactType, DOCKER_ATTESTATION, 'attestation artifact type');
  const attestationSubject = requireRecord(
    attestation.subject,
    'attestation manifest subject',
  );
  requireExact(
    attestationSubject.mediaType,
    OCI_MANIFEST,
    'attestation subject media type',
  );
  requireExact(
    attestationSubject.digest,
    platformDigest,
    'attestation manifest subject digest',
  );
  const config = requireRecord(attestation.config, 'attestation manifest config');
  requireExact(config.mediaType, OCI_EMPTY_CONFIG, 'attestation config media type');
  requireDigest(config.digest, 'attestation config digest');
  if (!Array.isArray(attestation.layers)) fail('attestation layers must be an array');

  const provenanceLayer = requireSingle(
    attestation.layers.filter(
      (layer) =>
        isRecord(layer) &&
        layer.mediaType === IN_TOTO_LAYER &&
        layer.annotations?.['in-toto.io/predicate-type'] === SLSA_V1,
    ),
    'SLSA v1 provenance layer',
  );
  const sbomLayer = requireSingle(
    attestation.layers.filter(
      (layer) =>
        isRecord(layer) &&
        layer.mediaType === IN_TOTO_LAYER &&
        layer.annotations?.['in-toto.io/predicate-type'] === SPDX_PREDICATE,
    ),
    'BuildKit SPDX layer',
  );
  if (attestation.layers.length !== 2) {
    fail('attestation manifest must contain only provenance and SPDX layers');
  }
  const provenanceLayerDigest = requireDigest(
    provenanceLayer.digest,
    'provenance layer digest',
  );
  const sbomLayerDigest = requireDigest(sbomLayer.digest, 'SPDX layer digest');

  const completeness = validateSlsaV1Predicate(predicate, {
    githubRepository,
    githubRef,
    releaseSha,
    target,
    nodeBaseImage,
    runtimeBaseImage,
  });

  return {
    schema: 'setservice.buildkit-provenance-evidence/v1',
    source: 'docker-buildx-imagetools-inspect',
    image: {
      repository: imageRepository,
      indexDigest: immutableDigest,
      platform: 'linux/amd64',
      manifestDigest: platformDigest,
    },
    attestation: {
      manifestDigest: attestationDigest,
      subjectManifestDigest: platformDigest,
      predicateType: SLSA_V1,
      provenanceLayerDigest,
      sbomPredicateType: SPDX_PREDICATE,
      sbomLayerDigest,
    },
    completeness,
    predicate,
  };
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) fail('invalid command arguments');
    values.set(flag.slice(2), value);
  }
  return values;
}

function readJson(path, field) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail(`${field} is not valid JSON`);
  }
}

function requiredArgument(args, name) {
  const value = args.get(name);
  if (!value) fail(`missing --${name}`);
  return value;
}

function runCli() {
  const args = parseArguments(process.argv.slice(2));
  const output = requiredArgument(args, 'output');
  const evidence = validateBuildkitProvenance({
    index: readJson(requiredArgument(args, 'index'), 'image index'),
    attestationManifest: readJson(
      requiredArgument(args, 'attestation-manifest'),
      'attestation manifest',
    ),
    predicate: readJson(requiredArgument(args, 'predicate'), 'SLSA predicate'),
    immutableRef: requiredArgument(args, 'immutable-ref'),
    imageRepository: requiredArgument(args, 'image-repository'),
    releaseSha: requiredArgument(args, 'release-sha'),
    githubRepository: requiredArgument(args, 'github-repository'),
    githubRef: requiredArgument(args, 'github-ref'),
    target: requiredArgument(args, 'target'),
    nodeBaseImage: requiredArgument(args, 'node-base-image'),
    runtimeBaseImage: requiredArgument(args, 'runtime-base-image'),
  });
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  console.log('BuildKit provenance evidence: OK');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown validation error';
    console.error(`::error::BuildKit provenance validation failed: ${message}`);
    process.exitCode = 1;
  }
}
