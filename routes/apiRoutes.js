/**
 * API routes (documentation §34).
 */

const express = require('express');

const imageController = require('../controllers/imageController');
const searchController = require('../controllers/searchController');
const upload = require('../middleware/upload');
const { validateImageUpload } = require('../middleware/validation');
const requireDb = require('../middleware/requireDb');
const { enabledProviders } = require('../providers');

const router = express.Router();

router.get('/health', (_req, res) => {
    res.json({
        ok: true,
        providers: enabledProviders().map((p) => p.name)
    });
});

/* Index flow */
router.get('/images', requireDb, imageController.listImages);
router.post('/images', requireDb, upload, validateImageUpload, imageController.indexImage);
router.get('/images/:id', requireDb, imageController.getImage);
router.get('/images/:id/thumbnail', requireDb, imageController.getThumbnail);
router.delete('/images/:id', requireDb, imageController.deleteImage);

/* Search flow */
router.post('/search', requireDb, ...searchController.search);

/* History */
router.get('/searches', requireDb, searchController.recentSearches);

module.exports = router;
