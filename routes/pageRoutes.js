/**
 * Page routes — EJS shells only (documentation §35).
 *
 * Each page renders its view to a fragment string, then layout.ejs wraps it.
 * No results.ejs exists: results render client-side from JSON.
 */

const path = require('path');
const express = require('express');
const ejs = require('ejs');

const router = express.Router();
const viewsDir = path.join(__dirname, '..', 'views');

function renderFragment(view) {
    return new Promise((resolve, reject) => {
        ejs.renderFile(path.join(viewsDir, `${view}.ejs`), {}, (err, html) => {
            if (err) reject(err);
            else resolve(html);
        });
    });
}

const PAGES = [
    { path: '/', view: 'index', title: 'Saka-irs — Visual Search' },
    { path: '/library', view: 'library', title: 'Library — Saka-irs' },
    { path: '/history', view: 'history', title: 'History — Saka-irs' }
];

for (const page of PAGES) {
    router.get(page.path, async (_req, res, next) => {
        try {
            const body = await renderFragment(page.view);
            return res.status(200).render('layout', { body, title: page.title });
        } catch (err) {
            return next(err);
        }
    });
}

module.exports = router;
