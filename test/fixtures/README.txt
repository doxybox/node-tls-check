These certificate and private key files are public, disposable test fixtures.
They identify localhost / 127.0.0.1 and are used only by local test servers.
Never use this key outside tests. It is not a credential for any deployed service.

Generated with:
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj /CN=localhost \
  -addext subjectAltName=DNS:localhost,IP:127.0.0.1 \
  -keyout test-only-key.pem -out test-only-cert.pem
