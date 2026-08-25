/**
 * Search model — lightweight record of each executed search.
 */

const mongoose = require('mongoose');

const providerRunSchema = new mongoose.Schema({
    name: { type: String, required: true },          // e.g. "local-hash"
    status: {
        type: String,
        enum: ['ok', 'failed', 'skipped'],
        required: true
    },
    resultCount: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    error: { type: String, default: null }           // failure reason when status=failed
}, { _id: false });

const searchSchema = new mongoose.Schema({
    queryImageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Image', default: null },

    providersUsed: [providerRunSchema],

    hints: {
        name: { type: String, default: null },
        location: { type: String, default: null },
        username: { type: String, default: null },
        organization: { type: String, default: null },
        keyword: { type: String, default: null }
    },

    resultCount: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },

    status: {
        type: String,
        enum: ['completed', 'partial', 'failed'],
        default: 'completed'
    },

    createdAt: { type: Date, default: Date.now }
});

// Keep search history lightweight.
searchSchema.index({ createdAt: -1 });
searchSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // 30 days

module.exports = mongoose.model('Search', searchSchema);
