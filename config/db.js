/**
 * MongoDB connection management (config/db.js).
 *
 * Connection failures never crash the process — the server stays up and
 * reports readiness via isDbReady() so endpoints can fail gracefully.
 */

const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

async function connectDB() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        console.warn('[db] MONGODB_URI is not configured.');
        return false;
    }

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 4000
        });
        console.log(`[db] connected → ${mongoose.connection.name}`);
        return true;
    } catch (err) {
        console.error(`[db] connection failed → ${err.message}`);
        return false;
    }
}

/** True when the underlying connection is currently open. */
function isDbReady() {
    return mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isDbReady, mongoose };
