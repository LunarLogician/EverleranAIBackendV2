/**
 * Generic validation middleware factory.
 *
 * Pass a synchronous function that receives `req` and returns an error
 * string on failure, or null/undefined on success.
 *
 * Usage:
 *   router.post('/route', validateRequest(req => {
 *     if (!req.body.name) return 'name is required';
 *   }), handler);
 */
const validateRequest = (validatorFn) => (req, res, next) => {
  const error = validatorFn(req);
  if (error) {
    return res.status(400).json({ success: false, message: error });
  }
  next();
};

module.exports = validateRequest;
