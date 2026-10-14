import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { pruneSessions } from './db.js';
import { attachUser } from './auth.js';
import { errorHandler } from './http.js';
import { attachRealtime } from './realtime.js';
import { ensureHaloHq } from './provision.js';
import { authRoutes } from './routes/auth.js';
import { dmRoutes } from './routes/dms.js';
import { friendRoutes } from './routes/friends.js';
import { messageRoutes } from './routes/messages.js';
import { serverRoutes } from './routes/servers.js';
import { uploadRoutes } from './routes/uploads.js';
import { userRoutes } from './routes/users.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'halo', time: Date.now() }));
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/dms', dmRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);

app.use(
  '/uploads',
  express.static(config.uploadsDir, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }),
);

// In production the built client is served by this same process.
const clientDist = path.join(ROOT, 'client', 'dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist, { index: false }));
  app.get(/^\/(?!api|uploads|socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  console.log('[halo] serving built client from client/dist');
}

app.use(errorHandler);

const server = http.createServer(app);
attachRealtime(server);

pruneSessions();
ensureHaloHq();

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[halo] api + realtime listening on http://0.0.0.0:${config.port}`);
  console.log(`[halo] database: ${config.dbPath}`);
});
