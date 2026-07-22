import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TARGETS = {
  admin: [
    ['VITE_API_BASE_URL', 'Admin API'],
    ['VITE_KIOSK_BASE_URL', 'Admin QR kiosk'],
  ],
  company: [['VITE_API_BASE_URL', 'Company API']],
  kiosk: [['VITE_API_BASE_URL', 'QR kiosk API']],
  worker: [['STAGING_API_BASE_URL', 'Worker app staging API']],
};

export function validateReleaseEnvironment(target, environment = process.env) {
  const requiredVariables = TARGETS[target];
  if (!requiredVariables) {
    throw new Error(`Unknown web release target: ${target}`);
  }

  const validated = {};
  for (const [name, label] of requiredVariables) {
    validated[name] = validateProductionUrl(environment[name], name, label);
  }
  return validated;
}

export function validateProductionUrl(rawValue, variableName, label = variableName) {
  const value = rawValue?.trim();
  if (!value) {
    throw new Error(`${variableName} is required for the ${label} production build.`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} must be an absolute URL.`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${variableName} must use HTTPS in a production build.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${variableName} must not contain embedded credentials.`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${variableName} must not contain a query string or fragment.`);
  }
  if (!parsed.hostname || isPrivateOrLocalHostname(parsed.hostname)) {
    throw new Error(`${variableName} must use a public production hostname.`);
  }

  return parsed.toString().replace(/\/+$/, '');
}

export function isPrivateOrLocalHostname(rawHostname) {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localdomain') ||
    hostname.endsWith('.internal') ||
    hostname === 'home.arpa' ||
    hostname.endsWith('.home.arpa') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home') ||
    hostname.endsWith('.corp') ||
    hostname.endsWith('.intranet') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.example') ||
    hostname.endsWith('.invalid') ||
    hostname === 'example.com' ||
    hostname.endsWith('.example.com') ||
    hostname === 'example.net' ||
    hostname.endsWith('.example.net') ||
    hostname === 'example.org' ||
    hostname.endsWith('.example.org')
  ) {
    return true;
  }

  if (hostname.includes(':')) {
    return (
      hostname === '::' ||
      hostname === '::1' ||
      hostname.startsWith('::ffff:') ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe8') ||
      hostname.startsWith('fe9') ||
      hostname.startsWith('fea') ||
      hostname.startsWith('feb') ||
      hostname.startsWith('ff') ||
      hostname === '2001:db8::' ||
      hostname.startsWith('2001:db8:')
    );
  }

  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return !hostname.includes('.');
  }

  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  const target = process.argv[2];
  try {
    const validated = validateReleaseEnvironment(target);
    console.log(`Validated ${target} release environment: ${Object.keys(validated).join(', ')}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
