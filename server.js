/**
 * Saka-irs server entry point.
 *
 * Boots Express, wires page/API routes, starts the retention sweeper and
 * connects to MongoDB (non-fatally — the app stays up and reports errors
 * if the database is unreachable).
 *
 * Plain JavaScript / CommonJS. No build step.
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const pageRoutes = require('./routes/pageRoutes');
const apiRoutes = require('./routes/apiRoutes');
const errorHandler = require('./middleware/errorHandler');
const StorageService = require('./services/StorageService');
const { connectDB, mongoose } = require('./config/db');
const { startRetentionSweeper, stopRetentionSweeper } = require('./utils/sweeper');

const app = express();
const PORT = process.env.PORT || 3000;

/* ── Security ─────────────────────────────────────────────── */
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'blob:']
        }
    }
}));

/* ── Parsing & static assets ──────────────────────────────── */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ── View engine ──────────────────────────────────────────── */
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

/* ── Rate limiting on the API ─────────────────────────────── */
app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
}));

/* ── Routes ───────────────────────────────────────────────── */
app.use('/', pageRoutes);
app.use('/api', apiRoutes);

/* ── 404 + centralized error handling ─────────────────────── */
app.use((req, res, next) => {
    const err = new Error(`Not found → ${req.originalUrl}`);
    err.status = 404;
    next(err);
});
app.use(errorHandler);

/* ── Boot ─────────────────────────────────────────────────── */
async function boot() {
    try {
        StorageService.ensureStorageDirs();
        console.log('[storage] directories ready');
    } catch (err) {
        console.error(`[storage] directory setup failed → ${err.message}`);
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log(`[saka-irs] listening → http://localhost:${PORT}`);
    });

    startRetentionSweeper();
    await connectDB();
}

boot().catch((err) => {
    console.error('[saka-irs] fatal boot error →', err);
    process.exit(1);
});

/* ── Graceful shutdown ────────────────────────────────────── */
function shutdown(signal) {
    console.log(`[saka-irs] ${signal} received — shutting down`);
    stopRetentionSweeper();
    mongoose.connection.close(false).finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;

