# Node TLS Check

Compare Node's `https.get()` and `fetch()` against the same HTTPS endpoint. Useful when an API call works in one client but fails with a certificate error in another, including development servers behind a company proxy.

**No dependencies. Node.js 24 or newer. Windows, macOS and Linux.**

## Run

```sh
git clone https://github.com/doxybox/node-tls-check.git
cd node-tls-check
node bin/check.mjs https://example.com
```

To include certificates trusted by your operating system:

```sh
node --use-system-ca bin/check.mjs https://example.com
```

The tool sends two GET requests, one through each client. It keeps certificate verification enabled, does not follow redirects, and discards response bodies. Use an endpoint where GET requests are appropriate.

## Reading the result

Example output, abbreviated:

```text
https.get: UNABLE_TO_GET_ISSUER_CERT_LOCALLY
fetch:     HTTP 200
```

| Result | Next step |
| --- | --- |
| Both return an HTTP status | Compare the failing application's target URL, custom agent and `ca` settings. |
| Only one fails | Use this smaller reproduction to investigate differences between the clients. |
| Both fail | Check the error codes. DNS, connection and timeout errors do not necessarily indicate a CA problem. |

An HTTP 404 or 500 still means the client established an HTTP connection. Exit code `0` means both clients received HTTP responses, `1` means at least one client failed, and `2` means invalid arguments.

The requests run concurrently and can reach different backend connections. The result is a diagnostic observation, not proof of a particular root cause. A successful system-CA run also does not prove which certificate source was used.

## Additional CA certificates

Use a PEM certificate bundle approved by your organization. Set `NODE_EXTRA_CA_CERTS` **before** starting Node.

macOS / Linux:

```sh
NODE_EXTRA_CA_CERTS=/path/company-ca.pem node --use-system-ca bin/check.mjs https://example.com
```

PowerShell (applies to the current shell):

```powershell
$env:NODE_EXTRA_CA_CERTS = 'C:\certs\company-ca.pem'
node --use-system-ca bin/check.mjs https://example.com
```

An explicit TLS `ca` option in an application replaces the default trust list. Do not disable certificate verification to resolve trust problems. See [Node's CA documentation](https://nodejs.org/api/cli.html#node_extra_ca_certsfile) and [system CA support](https://nodejs.org/api/cli.html#--use-system-ca).

## Options

```sh
node bin/check.mjs https://example.com --json --timeout 5000
```

- `--json`: structured output for comparing runs.
- `--timeout`: deadline for each client, from 1 to 60000 milliseconds; default 10000.
- `--help`: usage details.

Reports include only the URL origin, omitting path and query. URLs with embedded credentials are rejected. The full URL is still sent to the endpoint. Reports contain no certificate contents, response bodies or environment-variable values.

## Development

```sh
npm test
```

Tests use local servers and a deliberately public test-only certificate/key. They cover certificate rejection and explicit trust, redirects, HTTP errors, timeouts and argument handling. No package installation or public network access is needed for the tests.

The initial development used AI assistance. The project is a general Node diagnostic; it does not reproduce every operating-system trust store, proxy or application configuration.

## License

MIT — see [LICENSE](LICENSE).
