/**
 * Centralized error handler.
 *
 * API routes receive JSON errors; page routes receive the EJS error shell.
 * Never leaks stack traces or filesystem paths to clients.
 */

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    const status = err.status && Number.isInteger(err.status) ? err.status : 500;
    const message = status >= 500 ? 'Internal server error.' : err.message;

    if (status >= 500) {
        console.error('[error]', err.stack || err.message);
    }

    if (req.originalUrl && req.originalUrl.startsWith('/api')) {
        return res.status(status).json({
            error: {
                status,
                message
            }
        });
    }

    return res.status(status).render('error', {
        title: `Error ${status} — Saka-irs`,
        status,
        message
    });
}

module.exports = errorHandler;
