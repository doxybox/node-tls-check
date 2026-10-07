import { checkTarget, explain } from '../lib/check.mjs';

const help = `Node TLS Check (Node 24+)

Usage: node [Node options] bin/check.mjs <https-url> [--json] [--timeout <ms>]

Compare https.get and fetch against the same URL, without following redirects.
Two GET requests are sent; response bodies are discarded.

  --json          Print structured output
  --timeout <ms>  Per-client deadline, 1-60000 ms (default: 10000)
  --help          Show this help

Example:
  node --use-system-ca bin/check.mjs https://example.com --json

Exit codes: 0 both clients reached HTTP; 1 a client failed; 2 invalid arguments.
`;

function parseArgs(args) {
  let json = false;
  let timeoutMs = 10000;
  let url;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') json = true;
    else if (arg === '--timeout') {
      const value = args[++i];
      if (!value || !/^\d+$/.test(value)) throw new Error('--timeout requires an integer from 1 to 60000.');
      timeoutMs = Number(value);
      if (timeoutMs < 1 || timeoutMs > 60000) throw new Error('--timeout must be between 1 and 60000.');
    } else if (arg.startsWith('--')) throw new Error('Unknown option. Run with --help.');
    else if (url !== undefined) throw new Error('Provide exactly one HTTPS URL.');
    else url = arg;
  }
  if (!url) throw new Error('Provide an HTTPS URL. Run with --help.');
  let target;
  try { target = new URL(url); } catch { throw new Error('The URL is not valid.'); }
  if (target.protocol !== 'https:') throw new Error('Only HTTPS URLs are supported.');
  if (target.username || target.password) throw new Error('URLs containing credentials are not supported.');
  return { target, json, timeoutMs };
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(help);
} else {
  let options;
  try {
    options = parseArgs(args);
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
      throw new Error('Certificate verification is disabled by NODE_TLS_REJECT_UNAUTHORIZED. Remove that setting before running this diagnostic.');
    }
  } catch (error) {
    options = undefined;
    console.error(error.message);
    process.exitCode = 2;
  }
  if (options) {
    const result = await checkTarget(options.target, options.timeoutMs);
    const diagnosis = explain(result);
    if (options.json) console.log(JSON.stringify({ ...result, diagnosis }, null, 2));
    else {
      const format = (client) => client.ok ? `HTTP ${client.status}` : client.code;
      console.log(`Target: ${result.target} (path and query omitted from report)`);
      console.log(`Node: ${result.node}`);
      console.log(`CA certificates: ${result.certificateCounts.system} system / ${result.certificateCounts.default} default`);
      console.log(`https.get: ${format(result.https)}`);
      console.log(`fetch:     ${format(result.fetch)}`);
      console.log(`\n${diagnosis}`);
    }
    process.exitCode = result.https.ok && result.fetch.ok ? 0 : 1;
  }
}
