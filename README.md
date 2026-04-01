# eSIM Proxy System - Complete Implementation

A production-grade, dual-mode Go application providing authenticated reverse proxy (server mode) and transparent TUN/DNS/MITM interception (client mode) for network monitoring, privacy, and security.

## Components

- **Server Mode**: Reverse proxy with API key auth, rate limiting, request logging, and TLS-verified backend forwarding
- **Client Mode**: Full Android/Linux network intercept stack (TUN, DNS, MITM proxy, optional gRPC tunnel)
- **DNS Resolver**: Caching, blocklist, upstream forwarding with TTL-aware storage
- **MITM Proxy**: Certificate pinning, uTLS-capable, domain monitoring, response hooks
- **gRPC Tunnel**: Optional bidirectional encrypted tunnel for egress traffic
- **SOCKS5 Bridge**: Bridges tun2socks to HTTP proxy

## Building

```bash
# Download dependencies
go mod download

# Build the binary
go build -o esim-proxy main.go tunnel.pb.go tunnel_grpc.pb.go

# Or with build flags for Android/cross-compile
GOOS=linux GOARCH=arm64 go build -o esim-proxy main.go tunnel.pb.go tunnel_grpc.pb.go
```

## Server Mode

Runs as a reverse proxy with API key authentication and rate limiting. Forwards requests to a backend service.

### Configuration (Environment Variables)

```bash
# Required
export BACKEND_URL="https://api.example.com"

# Optional
export PORT="8080"                          # Listen port (default: 8080)
export API_KEYS="key1,key2,key3"           # Comma-separated API keys
export API_KEY_FILE="/path/to/keys.txt"    # Newline-separated API keys (file)
export RATE_LIMIT="100"                     # Requests per minute per key (default: 100)
export BACKEND_HOST="api.example.com"      # Override backend Host header
```

### Running Server Mode

```bash
export BACKEND_URL="https://api.internal.example.com"
export API_KEYS="secret-key-1,secret-key-2"
./esim-proxy -mode=server
```

### Example Request

```bash
curl -H "X-API-Key: secret-key-1" \
  -H "X-Request-ID: req-12345" \
  http://localhost:8080/esim-proxy/users/123
```

The request will be normalized to `/v1/users/123` and forwarded to the backend with:
- Sanitized headers (allowlist: Accept, Content-Type, User-Agent, X-*, etc.)
- `Sec-GPC: 1` privacy header injected
- SHA256-hashed key validation (constant-time comparison)
- Per-key token bucket rate limiting
- JSON request/response logging with latency

### API Key Management

**Option 1: Environment Variable (recommended for secrets management)**
```bash
export API_KEYS="key1,key2,key3"
./esim-proxy -mode=server
```

**Option 2: File-Based (for large key rotations)**
```bash
# keys.txt
key1
key2
key3

export API_KEY_FILE="/etc/esim-proxy/keys.txt"
./esim-proxy -mode=server
```

### Health Check

```bash
curl http://localhost:8080/health
# Returns: 200 OK with "ok"
```

## Client Mode

Transparent network interception on Linux/Android with TUN device, DNS resolution, and MITM proxy. Requires root/CAP_NET_ADMIN.

### Configuration (Environment Variables)

```bash
# Required
export TUN_FD=3                                    # File descriptor of TUN device

# DNS
export UPSTREAM_DNS="1.1.1.1:53"                 # Upstream resolver (default: 1.1.1.1:53)

# Proxy
export PROXY_ADDR=":8080"                        # HTTP/HTTPS proxy listen (default: :8080)

# MITM CA
export CERT_ORG="GhostWire CA"                   # CA organization name (default: GhostWire CA)

# Optional gRPC tunnel for egress
export GRPC_TUNNEL="tunnel.example.com:9000"    # gRPC tunnel endpoint

# Domain monitoring
export MONITOR_ENABLED="true"                    # Enable domain monitoring (default: true)
export BLOCK_RANDOM_DOMAINS="true"              # Block random-looking domains (default: true)
```

### Running Client Mode (Android/Termux Example)

On a rooted Android device with Termux:

```bash
# Obtain TUN file descriptor (e.g., from VPNService)
# This example assumes you're running this from a custom app that passes FD=3

export TUN_FD=3
export UPSTREAM_DNS="1.1.1.1:53"
export PROXY_ADDR=":8080"
export MONITOR_ENABLED="true"
export BLOCK_RANDOM_DOMAINS="true"

./esim-proxy -mode=client
```

**With gRPC Tunnel (optional):**
```bash
export TUN_FD=3
export GRPC_TUNNEL="tunnel.example.com:9000"
./esim-proxy -mode=client
```

### Client Mode Flow

1. **DNS Server**: Starts on `:53` (UDP), caches responses, blocks domains on allowlist
2. **MITM Proxy**: Starts on `:8080` (HTTP), generates/loads CA certificates, intercepts CONNECT
3. **TUN Device**: Reads from file descriptor, feeds packets into tun2socks LWIP stack
4. **SOCKS5**: Starts on `:1080`, handles TCP/UDP from LWIP, bridges to HTTP proxy
5. **gRPC Tunnel** (optional): Bidirectional stream for egress traffic via remote server

### CA Certificate Management

The MITM proxy generates and persists certificates:

```
./ca.crt        # Root CA certificate (install in system trust store)
./ca.key        # Root CA private key (protect from unauthorized access)
```

To install the CA on Android:
```
adb push ca.crt /sdcard/Documents/
# Then: Settings > Security > Install Certificate > Select ca.crt
```

## Logging

### Server Mode Output

```json
{"timestamp":"2024-01-15T10:30:45.123456789Z","request_id":"1234567890123456789","method":"GET","original_path":"/esim-proxy/users/123","normalized_path":"/v1/users/123","client_ip":"192.168.1.100","status":200,"latency_ms":150}
```

### Client Mode Output

```
2024/01/15 10:30:45 TUN device opened
2024/01/15 10:30:45 Proxy listening on :8080
2024/01/15 10:30:45 SOCKS5 server listening on 127.0.0.1:1080, forwarding to HTTP proxy :8080
2024/01/15 10:30:45 DNS server listening on :53
2024/01/15 10:31:00 gRPC recv error: connection reset
```

## Rate Limiting

Token bucket per API key, reset each minute:

```
RATE_LIMIT=100 (default)
Window: 1 minute

Request 1: 100 tokens → 99 remaining ✓
Request 2: 99 tokens → 98 remaining ✓
Request 101: 0 tokens → REJECTED (429 Too Many Requests)
Request 102: (after 60s) 100 tokens → 99 remaining ✓
```

## Security Considerations

1. **API Key Storage**: Use environment variable injection or secrets manager, never commit keys
2. **TLS Backend**: Always use HTTPS backend in production
3. **TUN Root**: Client mode requires root/CAP_NET_ADMIN
4. **MITM CA**: Protect `ca.key` file (world-readable CA key = full MITM compromise)
5. **DNS Spoofing**: Upstream DNS must be trusted; consider DoH/DoT
6. **gRPC TLS**: Current implementation uses insecure credentials; add `WithTransportCredentials(creds.NewTLS(...))` for production

## Extension Points

### Pre-Process Hook (Server Mode)

```go
RegisterPreProcessHook(func(r *http.Request) (status int, errMsg string) {
    if strings.Contains(r.URL.Path, "/admin") && !isInternalIP(r.RemoteAddr) {
        return http.StatusForbidden, "admin access denied"
    }
    return 0, ""
})
```

### Modify Response Hook (Server Mode)

```go
RegisterModifyResponseHook(func(resp *http.Response) error {
    resp.Header.Set("X-Forwarded-By", "esim-proxy/1.0")
    return nil
})
```

### Domain Monitoring & Blocking (Client Mode)

Enable with `MONITOR_ENABLED=true` and `BLOCK_RANDOM_DOMAINS=true`. Domains matching the pattern `^[a-z0-9]{8,}$` are auto-blocked. Add custom logic:

```go
if isRandomLooking(domain) && blockRandom {
    AddToBlocklist(domain)
    // Blocks future requests to that domain
}
```

## Dependencies

- `google.golang.org/grpc` - Bidirectional tunnel
- `github.com/miekg/dns` - DNS server & client
- `github.com/elazarl/goproxy` - MITM proxy
- `github.com/eycorsican/go-tun2socks` - TUN to SOCKS adapter
- `github.com/songgao/water` - TUN device interface
- `github.com/armon/go-socks5` - SOCKS5 server
- `golang.org/x/time/rate` - Rate limiting

## Deployment

### Docker (Server Mode)

```dockerfile
FROM golang:1.21-alpine AS build
WORKDIR /build
COPY . .
RUN go build -o esim-proxy main.go tunnel.pb.go tunnel_grpc.pb.go

FROM alpine:latest
RUN apk add --no-cache ca-certificates
COPY --from=build /build/esim-proxy /usr/local/bin/
EXPOSE 8080
CMD ["esim-proxy", "-mode=server"]
```

```bash
docker build -t esim-proxy:latest .
docker run -e BACKEND_URL=https://api.example.com \
           -e API_KEYS=secret-key-1,secret-key-2 \
           -p 8080:8080 \
           esim-proxy:latest
```

### Kubernetes (Server Mode)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: esim-proxy
spec:
  replicas: 3
  selector:
    matchLabels:
      app: esim-proxy
  template:
    metadata:
      labels:
        app: esim-proxy
    spec:
      containers:
      - name: esim-proxy
        image: esim-proxy:latest
        ports:
        - containerPort: 8080
        env:
        - name: BACKEND_URL
          value: "https://api.internal.example.com"
        - name: API_KEYS
          valueFrom:
            secretKeyRef:
              name: esim-keys
              key: keys
        - name: RATE_LIMIT
          value: "500"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
```

### Systemd Service (Server Mode)

```ini
[Unit]
Description=eSIM Proxy Service
After=network.target

[Service]
Type=simple
User=esim-proxy
WorkingDirectory=/opt/esim-proxy
EnvironmentFile=/etc/esim-proxy/env
ExecStart=/usr/local/bin/esim-proxy -mode=server
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
```

```bash
# /etc/esim-proxy/env
BACKEND_URL=https://api.internal.example.com
API_KEY_FILE=/etc/esim-proxy/keys.txt
PORT=8080
RATE_LIMIT=100
```

## Testing

### Load Testing (Server Mode)

```bash
# Using Apache Bench
ab -n 1000 -c 100 -H "X-API-Key: secret-key-1" http://localhost:8080/esim-proxy/test

# Using hey
hey -n 1000 -c 100 -H "X-API-Key: secret-key-1" http://localhost:8080/esim-proxy/test
```

### Rate Limit Testing

```bash
# Send 101 requests in quick succession (limit is 100/min by default)
for i in {1..105}; do
  curl -H "X-API-Key: test-key" http://localhost:8080/esim-proxy/test 2>&1 | grep -o "HTTP/[0-9.]* [0-9]*"
done
```

### DNS Testing (Client Mode)

```bash
# From the client machine
dig @127.0.0.1 example.com

# With nslookup
nslookup example.com 127.0.0.1

# With timeout
timeout 2 dig @127.0.0.1 +short blockedomain.test
```

## Troubleshooting

**"no API keys configured"**
- Set `API_KEYS` or `API_KEY_FILE` before startup

**"BACKEND_URL must be set" (server mode)**
- Set `BACKEND_URL` environment variable

**"TUN_FD not set or zero" (client mode)**
- Pass valid TUN file descriptor via `TUN_FD`

**"DNS server error: listen udp :53: permission denied"**
- Run client mode as root (required for :53 binding)

**"gRPC tunnel not implemented"**
- gRPC tunnel is optional; remove `GRPC_TUNNEL` to use direct connections

**Rate limit always triggered**
- Check `RATE_LIMIT` setting; default is 100 req/min
- Verify API key is consistent across requests

**MITM proxy failing**
- Ensure `/dev/urandom` is readable (for key generation)
- Verify `ca.crt` and `ca.key` permissions are correct (644 and 600 respectively)

## Performance Tuning

- **Memory**: LWIP stack allocates ~4MB; increase `rateWindow` for fewer buckets
- **CPU**: goproxy multiplexing is single-threaded; run multiple instances with load balancer
- **DNS**: Cache TTL defaults to 300s; adjust in `cleanupLoop()` for more aggressive caching
- **TUN Read**: Buffer size is 1500 bytes (MTU); increase for jumbo frames


