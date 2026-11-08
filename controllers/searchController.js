/**
 * Search controller — Search flow endpoints (documentation §34).
 */

const Search = require('../models/Search');
const SearchService = require('../services/SearchService');
const ImageService = require('../services/ImageService');
const { isDbReady } = require('../config/db');
const { validateImageUpload } = require('../middleware/validation');
const upload = require('../middleware/upload');
const { sanitizeHints } = require('../utils/sanitize');

/** POST /api/search — run enabled providers against a query image. */
const search = [upload, validateImageUpload, async (req, res, next) => {
    try {
        if (!isDbReady()) {
            const err = new Error('Database unavailable — search cannot run.');
            err.status = 503;
            throw err;
        }

        const staged = await ImageService.stageQuery(req.upload);
        const payload = await SearchService.search({
            queryImageId: staged.queryImageId,
            hashes: staged.hashes,
            contentHash: staged.contentHash,
            hints: sanitizeHints(req.body),
            originalName: req.upload ? req.upload.originalName : null
        });

        payload.searchId = staged.queryImageId;
        payload.queryImage = { id: staged.queryImageId };

        return res.json(payload);
    } catch (err) {
        return next(err);
    }
}];

/** GET /api/searches — recent history. */
async function recentSearches(_req, res, next) {
    try {
        const searches = await Search.find({})
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();
        return res.json({
            count: searches.length,
            searches
        });
    } catch (err) {
        return next(err);
    }
}

module.exports = { search, recentSearches };
