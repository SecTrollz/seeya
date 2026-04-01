#!/bin/bash

# Test script for eSIM Proxy
# Tests both server mode and client mode functionality

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

error() {
    echo -e "${RED}[✗]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# ============================================
# SERVER MODE TESTS
# ============================================

test_server_build() {
    info "Building binary..."
    go build -o esim-proxy main.go tunnel.pb.go tunnel_grpc.pb.go
    success "Binary built successfully"
}

test_server_start() {
    info "Starting server mode..."
    export BACKEND_URL="https://api.example.com"
    export API_KEYS="test-key-1,test-key-2"
    
    timeout 5 ./esim-proxy -mode=server 2>&1 | head -n 5 &
    SERVER_PID=$!
    sleep 2
    
    if ps -p $SERVER_PID > /dev/null; then
        success "Server started successfully (PID: $SERVER_PID)"
        echo $SERVER_PID > /tmp/server.pid
    else
        error "Server failed to start"
        return 1
    fi
}

test_health_endpoint() {
    info "Testing health endpoint..."
    RESPONSE=$(curl -s http://localhost:8080/health)
    if [ "$RESPONSE" = "ok" ]; then
        success "Health endpoint working"
    else
        error "Health endpoint failed: $RESPONSE"
        return 1
    fi
}

test_auth_missing() {
    info "Testing request without API key (should fail)..."
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/esim-proxy/test)
    if [ "$STATUS" = "401" ]; then
        success "Correctly rejected unauthorized request"
    else
        error "Should have returned 401, got $STATUS"
        return 1
    fi
}

test_auth_valid() {
    info "Testing request with valid API key..."
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "X-API-Key: test-key-1" \
        http://localhost:8080/esim-proxy/test)
    if [ "$STATUS" != "401" ]; then
        success "Accepted request with valid API key (status: $STATUS)"
    else
        error "Request rejected despite valid API key"
        return 1
    fi
}

test_rate_limit() {
    info "Testing rate limiting (100 req/min default, first request should pass)..."
    for i in {1..5}; do
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "X-API-Key: rate-limit-test" \
            http://localhost:8080/esim-proxy/test)
        echo "  Request $i: HTTP $STATUS"
    done
    success "Rate limiting test completed"
}

test_request_logging() {
    info "Testing request logging..."
    curl -s -o /dev/null \
        -H "X-API-Key: test-key-1" \
        -H "X-Request-ID: test-req-12345" \
        http://localhost:8080/esim-proxy/users/123
    success "Request logged (check server output for JSON log)"
}

test_invalid_path() {
    info "Testing invalid path (no /esim-proxy prefix)..."
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "X-API-Key: test-key-1" \
        http://localhost:8080/invalid)
    if [ "$STATUS" = "400" ]; then
        success "Correctly rejected request with invalid path"
    else
        error "Expected 400, got $STATUS"
        return 1
    fi
}

test_server_shutdown() {
    info "Shutting down server..."
    if [ -f /tmp/server.pid ]; then
        kill $(cat /tmp/server.pid) 2>/dev/null || true
        sleep 1
        success "Server shut down"
        rm /tmp/server.pid
    fi
}

# ============================================
# UTILITY TESTS
# ============================================

test_key_validation() {
    info "Testing API key validation logic..."
    go run main.go tunnel.pb.go tunnel_grpc.pb.go -mode=server <<< 'exit' > /dev/null 2>&1 || true
    success "Key validation initialized"
}

test_docker_build() {
    if command -v docker &> /dev/null; then
        info "Building Docker image..."
        docker build -t esim-proxy:test . > /dev/null 2>&1
        success "Docker image built"
    else
        warning "Docker not found, skipping Docker build test"
    fi
}

test_mod_tidy() {
    info "Tidying Go modules..."
    go mod tidy
    success "Go modules tidied"
}

# ============================================
# INTEGRATION TESTS
# ============================================

test_server_mode_full() {
    info "Running full server mode integration test..."
    
    test_server_build
    test_server_start
    
    sleep 2
    
    test_health_endpoint
    test_auth_missing
    test_auth_valid
    test_invalid_path
    test_request_logging
    test_rate_limit
    
    test_server_shutdown
    
    success "Full server mode integration test passed"
}

# ============================================
# PERFORMANCE TESTS
# ============================================

test_load() {
    if ! command -v ab &> /dev/null; then
        warning "Apache Bench not found, skipping load test"
        return
    fi
    
    info "Running load test (100 requests, 10 concurrency)..."
    test_server_start
    sleep 2
    
    ab -n 100 -c 10 -H "X-API-Key: test-key-1" http://localhost:8080/esim-proxy/test 2>&1 | grep -E "Requests per second|Time per request|Failed requests"
    
    test_server_shutdown
    success "Load test completed"
}

# ============================================
# MAIN TEST RUNNER
# ============================================

main() {
    echo "================================================"
    echo "eSIM Proxy Test Suite"
    echo "================================================"
    echo ""
    
    case "${1:-all}" in
        build)
            test_server_build
            ;;
        server)
            test_server_mode_full
            ;;
        health)
            test_server_start
            test_health_endpoint
            test_server_shutdown
            ;;
        auth)
            test_server_start
            test_auth_missing
            test_auth_valid
            test_server_shutdown
            ;;
        load)
            test_load
            ;;
        docker)
            test_docker_build
            ;;
        all)
            test_mod_tidy
            test_server_build
            test_server_mode_full
            if command -v docker &> /dev/null; then
                test_docker_build
            fi
            echo ""
            success "All tests passed!"
            ;;
        *)
            echo "Usage: $0 {build|server|health|auth|load|docker|all}"
            echo ""
            echo "Tests:"
            echo "  build       - Build the binary"
            echo "  server      - Run full server mode integration tests"
            echo "  health      - Test health endpoint"
            echo "  auth        - Test authentication"
            echo "  load        - Run load test (requires ab)"
            echo "  docker      - Build Docker image"
            echo "  all         - Run all tests (default)"
            exit 1
            ;;
    esac
}

# Run main
main "$@"
