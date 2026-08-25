/**
 * StorageService — the ONLY component that touches filesystem paths.
 *
 * Layout (documentation §36):
 *   storage/uploads/<uuid>.<ext>       original upload (retained per policy)
 *   storage/normalized/<uuid>.webp     normalized working image
 *   storage/thumbnails/<uuid>.webp     256px WebP display thumbnail
 *   storage/temporary/                 multer staging (transient)
 *
 * Cloud-storage swap later only changes this file.
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'storage');

const dirs = {
    root: ROOT,
    uploads: path.join(ROOT, 'uploads'),
    normalized: path.join(ROOT, 'normalized'),
    thumbnails: path.join(ROOT, 'thumbnails'),
    temporary: path.join(ROOT, 'temporary')
};

async function ensureStorageDirs() {
    await Promise.all(Object.values(dirs).map((dir) => fs.mkdir(dir, { recursive: true })));
}

/** Move a validated original into uploads/. Returns its absolute path. */
async function persistOriginal(buffer, uuid, ext) {
    const target = path.join(dirs.uploads, `${uuid}.${ext}`);
    await fs.writeFile(target, buffer);
    return target;
}

async function persistNormalized(webpBuffer, uuid) {
    const target = path.join(dirs.normalized, `${uuid}.webp`);
    await fs.writeFile(target, webpBuffer);
    return target;
}

async function persistThumbnail(thumbBuffer, uuid) {
    const target = path.join(dirs.thumbnails, `${uuid}.webp`);
    await fs.writeFile(target, thumbBuffer);
    return target;
}

async function deleteIfExists(filePath) {
    if (!filePath) return;
    try {
        await fs.unlink(filePath);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}

/** Delete every file owned by an Image document. */
async function deleteImageFiles(image) {
    await Promise.all([
        deleteIfExists(image.storagePath),
        deleteIfExists(image.normalizedPath),
        deleteIfExists(image.thumbnailPath)
    ]);
}

function uuidFilename(ext) {
    const safeExt = String(ext || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
    return `${crypto.randomUUID()}.${safeExt}`;
}

/**
 * Sweep storage/ for orphaned or expired files (documentation §32).
 * A file is removed when:
 *  - no Image record references it, OR
 *  - its record exists but expiresAt has passed (TTL lag tolerance), OR
 *  - it sits in temporary/ older than 1 hour.
 * @returns {Promise<number>} count of files removed
 */
async function sweepOrphans() {
    const { mongoose } = require('../config/db');
    if (mongoose.connection.readyState !== 1) {
        return 0; // nothing to compare against without the DB
    }

    const Image = require('../models/Image');
    const now = Date.now();
    let removed = 0;

    const records = await Image.find({}, 'storagePath normalizedPath thumbnailPath expiresAt').lean();
    const referenced = new Set();
    const expiredPaths = new Set();

    for (const rec of records) {
        const paths = [rec.storagePath, rec.normalizedPath, rec.thumbnailPath].filter(Boolean);
        if (rec.expiresAt && new Date(rec.expiresAt).getTime() <= now) {
            paths.forEach((p) => expiredPaths.add(p));
        } else {
            paths.forEach((p) => referenced.add(p));
        }
    }

    async function cleanDir(dir, keepAll) {
        let entries = [];
        try {
            entries = await fs.readdir(dir);
        } catch {
            return;
        }
        for (const name of entries) {
            const full = path.join(dir, name);
            if (keepAll === 'temporary') {
                try {
                    const st = await fs.stat(full);
                    if (now - st.mtimeMs > 60 * 60 * 1000) {
                        await fs.unlink(full);
                        removed++;
                    }
                } catch { /* ignore */ }
                continue;
            }
            if (referenced.has(full)) continue;
            if (expiredPaths.has(full) || !referenced.has(full)) {
                try {
                    await fs.unlink(full);
                    removed++;
                } catch { /* ignore */ }
            }
        }
    }

    await cleanDir(dirs.uploads);
    await cleanDir(dirs.normalized);
    await cleanDir(dirs.thumbnails);
    await cleanDir(dirs.temporary, 'temporary');

    return removed;
}

module.exports = {
    dirs,
    ensureStorageDirs,
    persistOriginal,
    persistNormalized,
    persistThumbnail,
    deleteImageFiles,
    deleteIfExists,
    uuidFilename,
    sweepOrphans
};
