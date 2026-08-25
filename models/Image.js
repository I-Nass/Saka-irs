/**
 * Image model — the indexed image record.
 *
 * Documents are TTL-expired via `expiresAt`; the retention sweeper
 * (utils/sweeper.js) removes the corresponding filesystem files,
 * because MongoDB TTL deletes documents only, never files.
 */

const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
    // Display-only name; never used to build storage paths.
    originalName: { type: String, required: true },

    role: {
        type: String,
        enum: ['library', 'query'],
        default: 'library',
        index: true
    },

    storagePath: { type: String, required: true },      // storage/uploads/<uuid>.<ext>
    normalizedPath: { type: String },                   // storage/normalized/<uuid>.webp
    thumbnailPath: { type: String },                    // storage/thumbnails/<uuid>.webp

    mimeType: { type: String, required: true },         // detected via magic bytes
    size: { type: Number, required: true },

    width: { type: Number },
    height: { type: Number },

    hashes: {
        phash: { type: String, required: true },        // 16-char hex
        dhash: { type: String, required: true },
        ahash: { type: String, required: true }
    },

    contentHash: { type: String, index: true },         // sha256 of original bytes → exact duplicates

    metadata: {
        hasExif: { type: Boolean, default: false },
        takenAt: { type: Date, default: null },
        cameraModel: { type: String, default: null },
        hasGps: { type: Boolean, default: false }
    },

    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
});

// Future optimization headroom (multi-index hashing / BK-tree).
imageSchema.index({ 'hashes.phash': 1 });

// TTL — MongoDB removes expired documents automatically (files handled by sweeper).
imageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Image', imageSchema);
