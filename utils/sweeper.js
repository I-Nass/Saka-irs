/**
 * Retention sweeper (documentation §32).
 *
 * MongoDB TTL indexes delete expired DOCUMENTS only — never files.
 * This sweeper closes that gap by walking storage/ and deleting files
 * whose Image records are gone or past expiry.
 */

const StorageService = require('../services/StorageService');

const SWEEP_INTERVAL_MS = parseInt(process.env.RETENTION_SWEEP_MINUTES || '30', 10) * 60 * 1000;
const BOOT_DELAY_MS = 10 * 1000;

let timer = null;

async function sweepOnce() {
    try {
        const removed = await StorageService.sweepOrphans();
        if (removed > 0) {
            console.log(`[sweeper] removed ${removed} orphaned/expired file(s)`);
        }
    } catch (err) {
        // Database hiccups must never crash the process.
        console.error(`[sweeper] sweep failed → ${err.message}`);
    }
}

function startRetentionSweeper() {
    if (timer) return timer;
    timer = setInterval(sweepOnce, SWEEP_INTERVAL_MS);
    timer.unref(); // never keep the process alive just for sweeping
    setTimeout(sweepOnce, BOOT_DELAY_MS).unref();
    console.log(`[sweeper] active — every ${SWEEP_INTERVAL_MS / 60000} min`);
    return timer;
}

function stopRetentionSweeper() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

module.exports = { startRetentionSweeper, stopRetentionSweeper, sweepOnce };
