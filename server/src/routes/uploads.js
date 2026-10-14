import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { bad, wrap } from '../http.js';
import { imageSize } from '../image-size.js';

export const uploadRoutes = express.Router();

const ALLOWED = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

uploadRoutes.post(
  '/',
  requireAuth,
  upload.single('file'),
  wrap((req, res) => {
    if (!req.file) return bad(res, 'No file was uploaded');
    const extension = ALLOWED.get(req.file.mimetype);
    if (!extension) return bad(res, 'Only PNG, JPEG, GIF, WebP and AVIF images are supported');

    const name = `${crypto.randomUUID()}.${extension}`;
    fs.writeFileSync(path.join(config.uploadsDir, name), req.file.buffer);
    const { width, height } = imageSize(req.file.buffer);

    res.status(201).json({
      attachment: {
        url: `/uploads/${name}`,
        filename: sanitizeName(req.file.originalname) || `image.${extension}`,
        mime: req.file.mimetype,
        size: req.file.size,
        width,
        height,
      },
    });
  }),
);

function sanitizeName(name) {
  return String(name ?? '')
    .replace(/[/\\]/g, '')
    .slice(0, 120);
}
