/**
 * Multer upload middleware.
 *
 * Stages uploads into storage/temporary/ under UUID names.
 * Original filenames are NEVER used for storage paths.
 * Deep validation happens in middleware/validation.js.
 */

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const StorageService = require('../services/StorageService');

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '15', 10);

const storage = multer.diskStorage({
    destination(_req, _file, cb) {
        cb(null, StorageService.dirs.temporary);
    },
    filename(_req, file, cb) {
        // Safe UUID name; extension kept lowercase and stripped of anything odd.
        const ext = typeof file.originalname === 'string' && file.originalname.includes('.')
            ? '.' + file.originalname.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)
            : '';
        cb(null, `${crypto.randomUUID()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
        files: 1
    },
    fileFilter(_req, file, cb) {
        // Coarse pre-filter only — magic-byte proof happens in validation.js.
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/tiff'];
        if (allowed.includes(file.mimetype)) {
            return cb(null, true);
        }
        const err = new Error('Unsupported media type.');
        err.status = 415;
        cb(err);
    }
});

/** Accepts a single multipart field named "image". */
module.exports = upload.single('image');
