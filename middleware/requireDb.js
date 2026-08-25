/**
 * Fails fast with 503 when MongoDB is unreachable, instead of letting
 * Mongoose buffer queries until its internal timeout.
 */

const { isDbReady } = require('../config/db');

function requireDb(req, res, next) {
    if (isDbReady()) return next();
    const err = new Error('Database unavailable — try again shortly.');
    err.status = 503;
    return next(err);
}

module.exports = requireDb;
