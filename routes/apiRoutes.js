/**
 * API routes (documentation §34).
 */

const express = require('express');

const imageController = require('../controllers/imageController');
const searchController = require('../controllers/searchController');
const upload = require('../middleware/upload');
const { validateImageUpload } = require('../middleware/validation');
const requireDb = require('../middleware/requireDb');
const QuotaService = require('../services/QuotaService');
const { enabledProviders } = require('../providers');

const router = express.Router();

router.get('/health', async (_req, res) => {
    const providers = enabledProviders();

    // Surface remaining external allowance instead of letting a spent free tier
    // look like a broken provider. Best-effort: never fail the health check.
    let quotas = null;
    try {
        const metered = providers
            .filter((p) => typeof p.quota === 'function')
            .map((p) => ({ name: p.name, ...p.quota() }));
        if (metered.length > 0) quotas = await QuotaService.snapshot(metered);
    } catch { /* quota read is informational only */ }

    res.json({
        ok: true,
        providers: providers.map((p) => p.name),
        quotas
    });
});

/* Reverse-image pivots — the browser uploads, this server never does */
router.get('/pivot/engines', imageController.getPivotEngines);
router.get('/images/:id/pivot.png', requireDb, imageController.getPivotImage);

/* Index flow */
router.get('/images', requireDb, imageController.listImages);
router.post('/images', requireDb, upload, validateImageUpload, imageController.indexImage);
router.get('/images/:id', requireDb, imageController.getImage);
router.get('/images/:id/thumbnail', requireDb, imageController.getThumbnail);
router.get('/images/:id/ela', requireDb, imageController.getForensicELA);
router.delete('/images/:id', requireDb, imageController.deleteImage);

/* Forensics */
router.post('/forensics/ela', upload, validateImageUpload, imageController.computeUploadELA);

/* Search flow */
router.post('/search', requireDb, ...searchController.search);

/* History */
router.get('/searches', requireDb, searchController.recentSearches);

module.exports = router;
