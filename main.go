package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/armon/go-socks5"
	"github.com/elazarl/goproxy"
	"github.com/eycorsican/go-tun2socks/core"
	"github.com/eycorsican/go-tun2socks/proxy/socks"
	"github.com/miekg/dns"
	"github.com/songgao/water"
	"golang.org/x/time/rate"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// ---------- Configuration (via environment) ----------
var (
	// Common
	mode           = flag.String("mode", "server", "Run mode: server or client")
	proxyPort      = getEnv("PORT", "8080")
	backendURL     = getEnv("BACKEND_URL", "")
	apiKeys        = getEnvSlice("API_KEYS", nil)
	apiKeyFile     = getEnv("API_KEY_FILE", "")
	rateLimit      = getEnvInt("RATE_LIMIT", 100)
	rateWindow     = time.Minute
	
	// Client mode
	tunFD          = getEnvInt("TUN_FD", 0)
	upstreamDNS    = getEnv("UPSTREAM_DNS", "1.1.1.1:53")
	proxyAddr      = getEnv("PROXY_ADDR", ":8080")
	grpcTunnel     = getEnv("GRPC_TUNNEL", "")
	certOrg        = getEnv("CERT_ORG", "GhostWire CA")
	blocklistURL   = getEnv("BLOCKLIST_URL", "")
	monitorEnabled = getEnvBool("MONITOR_ENABLED", true)
	blockRandom    = getEnvBool("BLOCK_RANDOM_DOMAINS", true)
	
	// Server mode
	requiredKeys map[string]bool
	keyHashes    map[string][]byte
)

// ---------- Helper Functions ----------
func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return def
}

func getEnvBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		return strings.EqualFold(v, "true") || v == "1"
	}
	return def
}

func getEnvSlice(key string, def []string) []string {
	if v := os.Getenv(key); v != "" {
		var out []string
		for _, part := range strings.Split(v, ",") {
			if trimmed := strings.TrimSpace(part); trimmed != "" {
				out = append(out, trimmed)
			}
		}
		return out
	}
	return def
}

func initKeys() {
	requiredKeys = make(map[string]bool)
	keyHashes = make(map[string][]byte)
	
	for _, key := range apiKeys {
		key = strings.TrimSpace(key)
		if key != "" {
			requiredKeys[key] = true
			h := sha256.Sum256([]byte(key))
			keyHashes[key] = h[:]
		}
	}
	
	if apiKeyFile != "" {
		f, err := os.Open(apiKeyFile)
		if err != nil {
			log.Fatalf("failed to open API key file: %v", err)
		}
		defer f.Close()
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			key := strings.TrimSpace(scanner.Text())
			if key != "" {
				requiredKeys[key] = true
				h := sha256.Sum256([]byte(key))
				keyHashes[key] = h[:]
			}
		}
		if err := scanner.Err(); err != nil {
			log.Fatalf("error reading API key file: %v", err)
		}
	}
	
	if len(requiredKeys) == 0 {
		log.Fatal("no API keys configured")
	}
}

func validateKey(key string) bool {
	if key == "" {
		return false
	}
	keyHash := sha256.Sum256([]byte(key))
	for _, validHash := range keyHashes {
		if subtle.ConstantTimeCompare(keyHash[:], validHash) == 1 {
			return true
		}
	}
	return false
}

func generateRequestID(r *http.Request) string {
	if id := r.Header.Get("X-Request-ID"); id != "" {
		return id
	}
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ips := strings.Split(xff, ",")
		return strings.TrimSpace(ips[0])
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

func sanitizeHeaders(r *http.Request) {
	allowed := map[string]bool{
		"Accept":          true,
		"Accept-Encoding": true,
		"Accept-Language": true,
		"Cache-Control":   true,
		"Content-Type":    true,
		"User-Agent":      true,
		"X-Request-ID":    true,
		"X-API-Key":       true,
	}
	for h := range r.Header {
		if !allowed[h] && !strings.HasPrefix(h, "X-") {
			r.Header.Del(h)
		}
	}
	r.Header.Del("Connection")
	r.Header.Del("Proxy-Connection")
	r.Header.Del("Keep-Alive")
	r.Header.Set("Sec-GPC", "1")
}

func normalizePath(path string) string {
	if !strings.HasPrefix(path, "/esim-proxy") {
		return ""
	}
	rest := strings.TrimPrefix(path, "/esim-proxy")
	if rest == "" {
		rest = "/"
	}
	return "/v1" + rest
}

func isRandomLooking(domain string) bool {
	sub := strings.Split(domain, ".")[0]
	return len(sub) > 8 && isAlphanumeric(sub)
}

func isAlphanumeric(s string) bool {
	for _, c := range s {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
			return false
		}
	}
	return true
}

func getBackendHost() string {
	if host := getEnv("BACKEND_HOST", ""); host != "" {
		return host
	}
	return "api.example.com"
}

// ---------- Global blocklist ----------
var globalBlocklist = struct {
	sync.RWMutex
	m map[string]bool
}{m: make(map[string]bool)}

func AddToBlocklist(domain string) {
	globalBlocklist.Lock()
	defer globalBlocklist.Unlock()
	globalBlocklist.m[domain] = true
}

func IsBlocked(domain string) bool {
	globalBlocklist.RLock()
	defer globalBlocklist.RUnlock()
	return globalBlocklist.m[domain]
}

// ---------- Rate limiting ----------
type tokenBucket struct {
	tokens     int
	lastRefill time.Time
}

var (
	clients   = make(map[string]*tokenBucket)
	clientsMu sync.Mutex
)

func allowRequest(key string) bool {
	now := time.Now()
	clientsMu.Lock()
	defer clientsMu.Unlock()
	
	bucket, ok := clients[key]
	if !ok {
		clients[key] = &tokenBucket{
			tokens:     rateLimit - 1,
			lastRefill: now,
		}
		return true
	}
	elapsed := now.Sub(bucket.lastRefill)
	if elapsed > rateWindow {
		bucket.tokens = rateLimit
		bucket.lastRefill = now
	}
	if bucket.tokens <= 0 {
		return false
	}
	bucket.tokens--
	return true
}

// ---------- Request logging ----------
func logRequest(r *http.Request, reqID string, status int, start time.Time, normalizedPath string) {
	entry := struct {
		Timestamp      string `json:"timestamp"`
		RequestID      string `json:"request_id"`
		Method         string `json:"method"`
		OriginalPath   string `json:"original_path"`
		NormalizedPath string `json:"normalized_path"`
		ClientIP       string `json:"client_ip"`
		Status         int    `json:"status"`
		LatencyMs      int64  `json:"latency_ms"`
	}{
		Timestamp:      time.Now().UTC().Format(time.RFC3339Nano),
		RequestID:      reqID,
		Method:         r.Method,
		OriginalPath:   r.URL.Path,
		NormalizedPath: normalizedPath,
		ClientIP:       getClientIP(r),
		Status:         status,
		LatencyMs:      time.Since(start).Milliseconds(),
	}
	data, _ := json.Marshal(entry)
	log.Println(string(data))
}

// ---------- Hooks ----------
type PreProcessHook func(r *http.Request) (status int, errMsg string)
type ModifyResponseHook func(resp *http.Response) error

var (
	preProcessHook    PreProcessHook
	modifyResponseHook ModifyResponseHook
)

func RegisterPreProcessHook(hook PreProcessHook) {
	preProcessHook = hook
}

func RegisterModifyResponseHook(hook ModifyResponseHook) {
	modifyResponseHook = hook
}

// ---------- Response Writer Wrapper ----------
type responseWriterWrapper struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriterWrapper) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

// ---------- DNS Resolver ----------
type DNSResolver struct {
	upstream  string
	blocklist map[string]bool
	cache     map[string]dnsEntry
	mu        sync.RWMutex
	server    *dns.Server
	stopChan  chan struct{}
}

type dnsEntry struct {
	msg    *dns.Msg
	expire time.Time
}

func NewDNSResolver(upstream string) *DNSResolver {
	return &DNSResolver{
		upstream:  upstream,
		blocklist: make(map[string]bool),
		cache:     make(map[string]dnsEntry),
		stopChan:  make(chan struct{}),
	}
}

func (r *DNSResolver) Start() error {
	r.server = &dns.Server{Addr: ":53", Net: "udp"}
	dns.HandleFunc(".", r.handle)
	go func() {
		if err := r.server.ListenAndServe(); err != nil {
			log.Printf("DNS server error: %v", err)
		}
	}()
	go r.cleanupLoop()
	return nil
}

func (r *DNSResolver) Stop() {
	close(r.stopChan)
	if r.server != nil {
		r.server.Shutdown()
	}
}

func (r *DNSResolver) handle(w dns.ResponseWriter, req *dns.Msg) {
	m := new(dns.Msg)
	m.SetReply(req)
	if len(req.Question) == 0 {
		w.WriteMsg(m)
		return
	}
	domain := req.Question[0].Name
	
	// Check blocklist
	r.mu.RLock()
	blocked := r.blocklist[domain]
	r.mu.RUnlock()
	if blocked {
		m.Rcode = dns.RcodeNameError
		w.WriteMsg(m)
		return
	}
	
	// Check cache
	r.mu.RLock()
	entry, ok := r.cache[domain]
	r.mu.RUnlock()
	if ok && time.Now().Before(entry.expire) {
		w.WriteMsg(entry.msg)
		return
	}
	
	// Forward upstream
	resp, err := dns.Exchange(req, r.upstream)
	if err != nil {
		m.Rcode = dns.RcodeServerFailure
		w.WriteMsg(m)
		return
	}
	
	// Cache response (simple TTL from answer)
	ttl := uint32(300)
	if len(resp.Answer) > 0 {
		ttl = resp.Answer[0].Header().Ttl
	}
	expire := time.Now().Add(time.Duration(ttl) * time.Second)
	r.mu.Lock()
	r.cache[domain] = dnsEntry{msg: resp, expire: expire}
	r.mu.Unlock()
	w.WriteMsg(resp)
}

func (r *DNSResolver) cleanupLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			r.mu.Lock()
			now := time.Now()
			for domain, entry := range r.cache {
				if now.After(entry.expire) {
					delete(r.cache, domain)
				}
			}
			r.mu.Unlock()
		case <-r.stopChan:
			return
		}
	}
}

// ---------- MITM Proxy ----------
type Proxy struct {
	addr   string
	server *http.Server
	caCert *x509.Certificate
	caKey  *rsa.PrivateKey
}

func NewProxy(addr string, caCert *x509.Certificate, caKey *rsa.PrivateKey) *Proxy {
	return &Proxy{addr: addr, caCert: caCert, caKey: caKey}
}

func (p *Proxy) Start() error {
	proxy := goproxy.NewProxyHttpServer()
	proxy.OnRequest().HandleConnect(goproxy.AlwaysMitm)
	
	// Set up custom CA for MITM
	proxy.Tr = &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	proxy.Ca = p.caCert
	proxy.CaPrivateKey = p.caKey
	
	// Add eSIM API rules
	proxy.OnRequest().DoFunc(func(req *http.Request, ctx *goproxy.ProxyCtx) (*http.Request, *http.Response) {
		if strings.HasPrefix(req.URL.Path, "/esim-proxy") {
			apiKey := req.Header.Get("X-API-Key")
			if !validateKey(apiKey) {
				return req, goproxy.NewResponse(req, goproxy.ContentTypeText, http.StatusUnauthorized, "unauthorized")
			}
			if !allowRequest(apiKey) {
				return req, goproxy.NewResponse(req, goproxy.ContentTypeText, http.StatusTooManyRequests, "rate limit exceeded")
			}
			newPath := normalizePath(req.URL.Path)
			if newPath == "" {
				return req, goproxy.NewResponse(req, goproxy.ContentTypeText, http.StatusBadRequest, "invalid path")
			}
			req.URL.Path = newPath
			req.Host = getBackendHost()
		}
		
		// Domain monitoring
		if monitorEnabled {
			domain := req.Host
			if isRandomLooking(domain) && blockRandom {
				AddToBlocklist(domain)
				return req, goproxy.NewResponse(req, goproxy.ContentTypeText, http.StatusForbidden, "blocked by monitor")
			}
		}
		return req, nil
	})
	
	// Response modification hook
	proxy.OnResponse().DoFunc(func(resp *http.Response, ctx *goproxy.ProxyCtx) *http.Response {
		if strings.Contains(resp.Header.Get("Content-Type"), "text/html") {
			// Extension point for ML-based consent banner detection
		}
		return resp
	})
	
	p.server = &http.Server{Addr: p.addr, Handler: proxy}
	go func() {
		log.Printf("Proxy listening on %s", p.addr)
		if err := p.server.ListenAndServe(); err != http.ErrServerClosed {
			log.Printf("proxy error: %v", err)
		}
	}()
	return nil
}

func (p *Proxy) Stop() {
	if p.server != nil {
		p.server.Close()
	}
}

// ---------- CA generation ----------
func loadOrGenerateCA() (*x509.Certificate, *rsa.PrivateKey, error) {
	certPath := "ca.crt"
	keyPath := "ca.key"
	if _, err := os.Stat(certPath); err == nil {
		certPEM, err := os.ReadFile(certPath)
		if err != nil {
			return nil, nil, err
		}
		keyPEM, err := os.ReadFile(keyPath)
		if err != nil {
			return nil, nil, err
		}
		block, _ := pem.Decode(certPEM)
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			return nil, nil, err
		}
		block, _ = pem.Decode(keyPEM)
		key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err != nil {
			return nil, nil, err
		}
		return cert, key, nil
	}
	
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, err
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization: []string{certOrg},
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().AddDate(10, 0, 0),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &priv.PublicKey, priv)
	if err != nil {
		return nil, nil, err
	}
	cert, err := x509.ParseCertificate(certDER)
	if err != nil {
		return nil, nil, err
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(priv)})
	if err := os.WriteFile(certPath, certPEM, 0644); err != nil {
		return nil, nil, err
	}
	if err := os.WriteFile(keyPath, keyPEM, 0600); err != nil {
		return nil, nil, err
	}
	return cert, priv, nil
}

// ---------- gRPC Tunnel Client ----------
type TunnelClientImpl struct {
	conn   *grpc.ClientConn
	stream Tunnel_StreamClient
	sendCh chan []byte
	recvCh chan []byte
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func NewTunnelClientImpl(addr string) (*TunnelClientImpl, error) {
	conn, err := grpc.Dial(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}
	client := NewTunnelClient(conn)
	stream, err := client.Stream(context.Background())
	if err != nil {
		conn.Close()
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	tc := &TunnelClientImpl{
		conn:   conn,
		stream: stream,
		sendCh: make(chan []byte, 100),
		recvCh: make(chan []byte, 100),
		ctx:    ctx,
		cancel: cancel,
	}
	tc.wg.Add(2)
	go tc.sendLoop()
	go tc.recvLoop()
	return tc, nil
}

func (tc *TunnelClientImpl) sendLoop() {
	defer tc.wg.Done()
	for {
		select {
		case data := <-tc.sendCh:
			if err := tc.stream.Send(&Frame{Data: data}); err != nil {
				log.Printf("gRPC send error: %v", err)
				tc.cancel()
				return
			}
		case <-tc.ctx.Done():
			return
		}
	}
}

func (tc *TunnelClientImpl) recvLoop() {
	defer tc.wg.Done()
	for {
		frame, err := tc.stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Printf("gRPC recv error: %v", err)
			tc.cancel()
			break
		}
		tc.recvCh <- frame.Data
	}
}

func (tc *TunnelClientImpl) Close() {
	tc.cancel()
	tc.wg.Wait()
	tc.conn.Close()
}

// Global tunnel client
var tunnelClient *TunnelClientImpl

func SetTunnelClient(tc *TunnelClientImpl) {
	tunnelClient = tc
}

// ---------- Server Mode ----------
func runServer() {
	if backendURL == "" {
		log.Fatal("BACKEND_URL must be set")
	}
	target, err := url.Parse(backendURL)
	if err != nil {
		log.Fatal(err)
	}
	
	proxy := httputil.NewSingleHostReverseProxy(target)
	
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.URL.Path = strings.TrimPrefix(req.URL.Path, "/esim-proxy")
		if req.URL.Path == "" {
			req.URL.Path = "/"
		}
		req.URL.Path = "/v1" + req.URL.Path
		req.Host = target.Host
	}
	
	proxy.ModifyResponse = func(resp *http.Response) error {
		if modifyResponseHook != nil {
			return modifyResponseHook(resp)
		}
		return nil
	}
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		reqID := generateRequestID(r)
		
		// Health endpoint
		if r.URL.Path == "/health" {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("ok"))
			logRequest(r, reqID, http.StatusOK, start, "")
			return
		}
		
		// Path validation
		if !strings.HasPrefix(r.URL.Path, "/esim-proxy") {
			http.Error(w, "invalid route", http.StatusBadRequest)
			logRequest(r, reqID, http.StatusBadRequest, start, "")
			return
		}
		
		// API key authentication
		apiKey := r.Header.Get("X-API-Key")
		if !validateKey(apiKey) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			logRequest(r, reqID, http.StatusUnauthorized, start, "")
			return
		}
		
		// Rate limit
		if !allowRequest(apiKey) {
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			logRequest(r, reqID, http.StatusTooManyRequests, start, "")
			return
		}
		
		// Pre-process hook
		if preProcessHook != nil {
			status, errMsg := preProcessHook(r)
			if status != 0 {
				http.Error(w, errMsg, status)
				logRequest(r, reqID, status, start, "")
				return
			}
		}
		
		// Sanitize headers
		sanitizeHeaders(r)
		
		// Forward request
		ww := &responseWriterWrapper{ResponseWriter: w, status: http.StatusOK}
		proxy.ServeHTTP(ww, r)
		
		logRequest(r, reqID, ww.status, start, r.URL.Path)
	})
	
	srv := &http.Server{
		Addr:         ":" + proxyPort,
		Handler:      handler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	
	go func() {
		log.Printf("Server mode: listening on :%s, backend %s", proxyPort, backendURL)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()
	
	<-stop
	log.Println("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("shutdown error: %v", err)
	}
	log.Println("server stopped")
}

// ---------- SOCKS5 Server ----------
func startSOCKS5Server(socksAddr, httpProxyAddr string) {
	dialer := func(ctx context.Context, network, addr string) (net.Conn, error) {
		return net.Dial(network, addr)
	}
	socksConf := &socks5.Config{
		Dial: dialer,
	}
	server, err := socks5.New(socksConf)
	if err != nil {
		log.Fatalf("failed to create SOCKS5 server: %v", err)
	}
	log.Printf("SOCKS5 server listening on %s, forwarding to HTTP proxy %s", socksAddr, httpProxyAddr)
	if err := server.ListenAndServe("tcp", socksAddr); err != nil {
		log.Fatalf("SOCKS5 server error: %v", err)
	}
}

// ---------- Client Mode ----------
func runClient() {
	if tunFD == 0 {
		log.Fatal("TUN_FD not set or zero")
	}
	
	// 1. Load or generate CA for MITM
	caCert, caKey, err := loadOrGenerateCA()
	if err != nil {
		log.Fatal("failed to init CA: ", err)
	}
	
	// 2. Start DNS resolver
	dnsServer := NewDNSResolver(upstreamDNS)
	if err := dnsServer.Start(); err != nil {
		log.Fatal("failed to start DNS server: ", err)
	}
	defer dnsServer.Stop()
	
	// 3. Start HTTP/HTTPS proxy (MITM)
	proxy := NewProxy(proxyAddr, caCert, caKey)
	if err := proxy.Start(); err != nil {
		log.Fatal("failed to start proxy: ", err)
	}
	defer proxy.Stop()
	
	// 4. gRPC tunnel client (if configured)
	if grpcTunnel != "" {
		tunnel, err := NewTunnelClientImpl(grpcTunnel)
		if err != nil {
			log.Printf("gRPC tunnel connection failed: %v; will use direct connections", err)
		} else {
			defer tunnel.Close()
			SetTunnelClient(tunnel)
		}
	}
	
	// 5. TUN device handling
	tunFile := os.NewFile(uintptr(tunFD), "tun")
	tun, err := water.New(water.Config{DeviceType: water.TUN, File: tunFile})
	if err != nil {
		log.Fatal("failed to open TUN device: ", err)
	}
	log.Println("TUN device opened")
	
	// Setup tun2socks stack
	lwipWriter := core.NewLWIPStack()
	socksAddr := "127.0.0.1:1080"
	
	// Start SOCKS5 server
	go startSOCKS5Server(socksAddr, proxyAddr)
	
	// Register handlers
	core.RegisterTCPConnHandler(socks.NewTCPHandler(socksAddr))
	core.RegisterUDPConnHandler(socks.NewUDPHandler(socksAddr))
	
	// Feed TUN packets into the stack
	go func() {
		buf := make([]byte, 1500)
		for {
			n, err := tun.Read(buf)
			if err != nil {
				log.Printf("TUN read error: %v", err)
				return
			}
			lwipWriter.Write(buf[:n])
		}
	}()
	
	// Wait for signal
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Println("shutting down client mode...")
}

// ---------- Main ----------
func main() {
	flag.Parse()
	initKeys()
	
	if *mode == "server" {
		runServer()
	} else if *mode == "client" {
		runClient()
	} else {
		log.Fatalf("unknown mode: %s", *mode)
	}
}
