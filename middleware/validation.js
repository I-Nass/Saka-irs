/**
 * Upload validation middleware — the full Section 13 pipeline.
 *
 *  1. file present
 *  2. size already enforced by multer (MAX_FILE_SIZE_MB)
 *  3. MAGIC-BYTE proof via file-type (client Content-Type is never trusted)
 *  4. extension cross-check against detected content
 *  5. real decode proof via sharp().metadata()
 *  6. pixel-budget cap (decompression-bomb guard)
 *
 * The temp file is consumed into memory and deleted here — staging only.
 * On success attaches: req.upload = { buffer, mimeType, width, height,
 *                                     size, originalName }
 */

const fs = require('fs/promises');
const { fromBuffer } = require('file-type');
const sharp = require('sharp');

const ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/tiff'
]);

const MAX_PIXELS = parseInt(process.env.MAX_PIXELS || '50000000', 10);

async function readTempFile(filePath) {
    const handle = await fs.open(filePath, 'r');
    try {
        const { size } = await handle.stat();
        const buffer = Buffer.alloc(size);
        await handle.read(buffer, 0, size, 0);
        return buffer;
    } finally {
        await handle.close();
    }
}

function httpError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

async function validateImageUpload(req, res, next) {
    if (!req.file) {
        return next(httpError(400, 'No image file received. Attach a multipart field named "image".'));
    }

    const tempPath = req.file.path;

    try {
        // ── magic bytes ────────────────────────────────────────
        const buffer = await readTempFile(tempPath);
        const detected = await fromBuffer(buffer);

        if (!detected || !ALLOWED_MIME.has(detected.mime)) {
            throw httpError(415, `Unsupported or unrecognizable image content${detected ? ` (detected ${detected.mime})` : ''}.`);
        }

        // ── extension cross-check ──────────────────────────────
        const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
        if (ext && !detected.ext.startsWith(ext)) {
            throw httpError(400, `File extension ".${ext}" does not match actual content (.${detected.ext}).`);
        }

        // ── decode proof + dimension cap ───────────────────────
        let meta;
        try {
            meta = await sharp(buffer).metadata();
        } catch {
            throw httpError(400, 'Image is corrupt or undecodable.');
        }

        const width = meta.width || 0;
        const height = meta.height || 0;
        if (width * height > MAX_PIXELS) {
            throw httpError(413, `Image exceeds the ${Math.round(MAX_PIXELS / 1e6)}MP pixel budget.`);
        }

        req.upload = {
            buffer,
            mimeType: detected.mime,
            width,
            height,
            size: buffer.length,
            originalName: req.file.originalname
        };

        return next();
    } catch (err) {
        return next(err);
    } finally {
        // Staging copy is always removed — success or failure.
        fs.unlink(tempPath).catch(() => {});
    }
}

module.exports = { validateImageUpload };
