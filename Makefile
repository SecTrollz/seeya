.PHONY: build clean test help fmt lint docker-build docker-run install-tools

# Default target
help:
	@echo "eSIM Proxy Makefile"
	@echo "==================="
	@echo ""
	@echo "Targets:"
	@echo "  build          - Build binary for current OS/architecture"
	@echo "  build-linux    - Build for Linux (ARM64)"
	@echo "  build-android  - Build for Android (ARM64)"
	@echo "  clean          - Remove build artifacts"
	@echo "  test           - Run tests"
	@echo "  fmt            - Format code"
	@echo "  lint           - Run linter"
	@echo "  install-tools  - Install build/test tools"
	@echo "  docker-build   - Build Docker image"
	@echo "  docker-run     - Run Docker container (server mode)"
	@echo "  server-local   - Run server mode locally"
	@echo "  mod-tidy       - Tidy go.mod"
	@echo ""

# Build for current platform
build: mod-tidy
	go build -v -o esim-proxy main.go tunnel.pb.go tunnel_grpc.pb.go

# Build for Linux ARM64
build-linux: mod-tidy
	GOOS=linux GOARCH=arm64 go build -v -o esim-proxy-linux-arm64 main.go tunnel.pb.go tunnel_grpc.pb.go

# Build for Android ARM64 (with PIE for security)
build-android: mod-tidy
	GOOS=android GOARCH=arm64 go build -v -ldflags="-w -s" -o esim-proxy-android main.go tunnel.pb.go tunnel_grpc.pb.go

# Clean build artifacts
clean:
	rm -f esim-proxy esim-proxy-* ca.crt ca.key
	go clean -testcache

# Format code
fmt:
	gofmt -w *.go

# Run linter
lint: install-tools
	golangci-lint run --deadline=5m

# Install development tools
install-tools:
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# Tidy dependencies
mod-tidy:
	go mod tidy
	go mod download

# Test (if tests are added)
test: mod-tidy
	go test -v -race -timeout 30s ./...

# Run server mode locally
server-local: build
	export BACKEND_URL="https://api.example.com" && \
	export API_KEYS="test-key-1,test-key-2" && \
	./esim-proxy -mode=server

# Build Docker image
docker-build: mod-tidy
	docker build -t esim-proxy:latest .

# Run Docker container
docker-run: docker-build
	docker run -e BACKEND_URL="https://api.example.com" \
		-e API_KEYS="test-key-1,test-key-2" \
		-p 8080:8080 \
		esim-proxy:latest

# Development setup
dev-setup: install-tools mod-tidy fmt
	@echo "Development environment ready"

# Stats
stats:
	@echo "=== Code Statistics ==="
	@wc -l main.go tunnel.pb.go tunnel_grpc.pb.go
	@echo ""
	@echo "Total lines:"
	@wc -l *.go | tail -1
	@echo ""
	@go mod graph | wc -l
	@echo "dependencies"

# Generate protobuf stubs (requires protoc)
protoc-gen:
	@command -v protoc >/dev/null 2>&1 || { echo "protoc not installed"; exit 1; }
	protoc --go_out=. --go-grpc_out=. tunnel.proto
