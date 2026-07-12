const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function shopOwnerMiddleware(req, res, next) {
  if (req.user?.role !== 'shop_owner') {
    return res.status(403).json({ error: 'Shop owner access required' });
  }
  next();
}

function parentMiddleware(req, res, next) {
  if (req.user?.role !== 'parent') {
    return res.status(403).json({ error: 'Parent access required' });
  }
  next();
}

function schoolAdminMiddleware(req, res, next) {
  if (req.user?.role !== 'school_admin') {
    return res.status(403).json({ error: 'School admin access required' });
  }
  next();
}

// Widened check for endpoints that are already school-wide in scope (no
// per-shop filter) and should be reachable by both a cashier and a school
// admin — e.g. viewing/searching the student roster, card management.
function staffMiddleware(req, res, next) {
  if (!['shop_owner', 'school_admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Staff access required' });
  }
  next();
}

module.exports = {
  authMiddleware, shopOwnerMiddleware, parentMiddleware, schoolAdminMiddleware, staffMiddleware,
};
