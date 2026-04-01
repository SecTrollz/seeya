FROM golang:1.21-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

# Copy source
COPY main.go tunnel.pb.go tunnel_grpc.pb.go go.mod go.sum* ./

# Download dependencies
RUN go mod download

# Build with optimizations
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o esim-proxy main.go tunnel.pb.go tunnel_grpc.pb.go

# Runtime stage
FROM alpine:latest

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Create non-root user
RUN addgroup -g 1000 esim && adduser -D -u 1000 -G esim esim

# Copy binary from builder
COPY --from=builder /build/esim-proxy /usr/local/bin/esim-proxy

# Ensure binary is executable
RUN chmod +x /usr/local/bin/esim-proxy

# Create working directory for certificates
RUN mkdir -p /app && chown -R esim:esim /app

WORKDIR /app
USER esim

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD /usr/local/bin/esim-proxy -mode=server 2>&1 | grep -q "listening" || exit 1

# Default port
EXPOSE 8080

# Default to server mode
ENTRYPOINT ["/usr/local/bin/esim-proxy"]
CMD ["-mode=server"]
