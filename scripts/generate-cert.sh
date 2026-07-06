#!/usr/bin/env bash
# Generate a self-signed TLS certificate for the dedicated server (WSS support).
# Usage: bash scripts/generate-cert.sh [ip-or-hostname]
#
# Produces server/cert.pem and server/key.pem. The browser will show a security
# warning for self-signed certs — click "Advanced → Proceed" to accept it once,
# then wss:// connections will work. For production, use a real cert (Let's
# Encrypt via a domain name).

set -e

HOST="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")/server"

# If openssl isn't available, fall back to Node's selfsigned-style generation.
if command -v openssl &>/dev/null; then
  if [ -n "$HOST" ]; then
    echo "Generating self-signed cert for host: $HOST"
    openssl req -x509 -newkey rsa:2048 -keyout "$SERVER_DIR/key.pem" \
      -out "$SERVER_DIR/cert.pem" -days 365 -nodes \
      -subj "/CN=$HOST" \
      -addext "subjectAltName=IP:$HOST,DNS:localhost" 2>/dev/null || \
    openssl req -x509 -newkey rsa:2048 -keyout "$SERVER_DIR/key.pem" \
      -out "$SERVER_DIR/cert.pem" -days 365 -nodes \
      -subj "/CN=$HOST"
  else
    echo "Generating self-signed cert (no specific host)"
    openssl req -x509 -newkey rsa:2048 -keyout "$SERVER_DIR/key.pem" \
      -out "$SERVER_DIR/cert.pem" -days 365 -nodes \
      -subj "/CN=AnimalStrike Server" \
      -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"
  fi
  echo "Done! Files created:"
  echo "  $SERVER_DIR/cert.pem"
  echo "  $SERVER_DIR/key.pem"
  echo ""
  echo "Start the server with TLS:"
  echo "  AS_TLS=true AS_TLS_CERT=$SERVER_DIR/cert.pem AS_TLS_KEY=$SERVER_DIR/key.pem npm run server"
else
  echo "openssl not found. Please install it, or generate certs manually."
  exit 1
fi
