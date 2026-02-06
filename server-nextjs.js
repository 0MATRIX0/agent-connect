// Custom server for Next.js
// Supports both HTTPS (self-signed certs) and HTTP (for use with Tailscale Serve)

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { parse } = require('url');

const CERTS_DIR = path.join(__dirname, 'certs');
const PORT = process.env.PORT || 3110;

// Import Next.js
const next = require('next');
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.LISTEN_HOST || '0.0.0.0';
const appDir = process.env.NEXT_APP_DIR || __dirname;
const app = next({ dev, hostname, port: PORT, dir: appDir });
const handle = app.getRequestHandler();

// Determine if we should use HTTPS directly or let Tailscale Serve handle TLS
const useHttps = process.env.DISABLE_SSL !== 'true' &&
                 fs.existsSync(path.join(CERTS_DIR, 'server.key')) &&
                 fs.existsSync(path.join(CERTS_DIR, 'server.crt'));

app.prepare().then(() => {
  const requestHandler = async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  };

  let server;
  let protocol;

  if (useHttps) {
    const sslOptions = {
      key: fs.readFileSync(path.join(CERTS_DIR, 'server.key')),
      cert: fs.readFileSync(path.join(CERTS_DIR, 'server.crt')),
    };
    server = https.createServer(sslOptions, requestHandler);
    protocol = 'https';
  } else {
    server = http.createServer(requestHandler);
    protocol = 'http';
  }

  // Proxy WebSocket upgrade requests (/ws/*) to the API server on localhost:3109
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url, true);
    if (!pathname || !pathname.startsWith('/ws/')) {
      // Let Next.js handle non-/ws/ upgrades (e.g. HMR in dev)
      return;
    }

    const proxyReq = http.request({
      hostname: '127.0.0.1',
      port: 3109,
      path: req.url,
      method: req.method,
      headers: req.headers,
    });

    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      // Send the 101 Switching Protocols response back to the client
      let rawHeaders = `HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`;
      for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
        rawHeaders += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`;
      }
      rawHeaders += '\r\n';

      socket.write(rawHeaders);
      if (proxyHead && proxyHead.length) {
        socket.write(proxyHead);
      }

      // Pipe bidirectionally
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);

      proxySocket.on('error', () => socket.destroy());
      socket.on('error', () => proxySocket.destroy());
    });

    proxyReq.on('error', (err) => {
      console.error('WebSocket proxy error:', err.message);
      socket.destroy();
    });

    proxyReq.end();
  });

  const displayHost = process.env.APP_HOSTNAME || hostname;
  server.listen(PORT, hostname, () => {
    console.log(`Next.js server running on ${protocol}://${displayHost}:${PORT}`);
    if (!useHttps) {
      console.log('Running in HTTP mode (TLS handled by Tailscale Serve)');
    }
  });
});
