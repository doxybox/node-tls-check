import https from 'node:https';
import tls from 'node:tls';

function failure(error) {
  return { ok: false, code: error.cause?.code ?? error.code ?? error.name ?? 'UNKNOWN' };
}

function checkHttps(target, timeoutMs) {
  return new Promise((resolve) => {
    let timer;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const req = https.get(target, (res) => {
      finish({ ok: true, status: res.statusCode });
      res.destroy();
    });
    req.once('error', (error) => finish(failure(error)));
    timer = setTimeout(() => {
      finish({ ok: false, code: 'TIMEOUT' });
      req.destroy();
    }, timeoutMs);
  });
}

async function checkFetch(target, timeoutMs) {
  try {
    const res = await fetch(target, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel();
    return { ok: true, status: res.status };
  } catch (error) {
    if (error.name === 'TimeoutError') return { ok: false, code: 'TIMEOUT' };
    return failure(error);
  }
}

export async function checkTarget(target, timeoutMs) {
  const [httpsResult, fetchResult] = await Promise.all([
    checkHttps(target, timeoutMs),
    checkFetch(target, timeoutMs),
  ]);
  return {
    target: target.origin,
    node: process.version,
    certificateCounts: {
      system: tls.getCACertificates('system').length,
      default: tls.getCACertificates('default').length,
    },
    https: httpsResult,
    fetch: fetchResult,
  };
}

export function explain(result) {
  if (result.https.ok && result.fetch.ok) {
    return 'Both clients received an HTTP response. If your app fails, compare its target, agent and CA options.';
  }
  if (result.https.ok !== result.fetch.ok) {
    return 'The clients differ in this process. Check the error code and compare their trust and connection settings.';
  }
  return 'Both clients failed. Use the error codes to distinguish certificate, DNS, connection and timeout failures.';
}
