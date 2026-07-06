const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { db } = require('../db/schema');
const { authMiddleware, shopOwnerMiddleware } = require('../middleware/auth');
const { getParentFor } = require('../services/family');
const { needsJunkApproval, APPROVAL_TIMEOUT_MS } = require('../services/approval');

// Sequentially debits one or more line items against a student's balance
// (falling back to the emergency fund per line), inserting one transaction
// row per line. Shared by the immediate pay-by-nfc path and the deferred
// parent-approval path (finalizePendingPurchase), so both debit identically.
async function debitAndRecord(card, lines, merchant, pendingPurchaseId = null) {
  let runningBalance = card.balance;
  let runningEmergency = card.emergency_balance || 0;
  const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const transactions = [];

  for (const line of lines) {
    const fromMain = Math.min(runningBalance, line.amount);
    const fromEmergency = line.amount - fromMain;
    runningBalance -= fromMain;
    runningEmergency -= fromEmergency;

    const txn = {
      id: uuidv4(),
      student_id: card.id,
      type: 'debit',
      amount: line.amount,
      description: line.description,
      merchant: merchant || 'School',
      balance_after: runningBalance,
      emergency_amount: fromEmergency,
      item_id: line.itemId,
      pending_purchase_id: pendingPurchaseId,
      created_at: createdAt,
    };
    await db.prepare(`
      INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after, emergency_amount, item_id, pending_purchase_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      txn.id, txn.student_id, txn.type, txn.amount, txn.description, txn.merchant,
      txn.balance_after, txn.emergency_amount, txn.item_id, txn.pending_purchase_id
    );
    transactions.push(txn);
  }

  await db.prepare('UPDATE students SET balance = ?, emergency_balance = ? WHERE id = ?')
    .run(runningBalance, runningEmergency, card.id);

  return { transactions, newBalance: runningBalance, newEmergencyBalance: runningEmergency };
}

function paymentResponse(card, transactions, newBalance, newEmergencyBalance, isCart) {
  const totalEmergencyUsed = transactions.reduce((sum, t) => sum + t.emergency_amount, 0);
  const student = {
    name: card.name,
    class: card.class,
    newBalance,
    emergencyBalance: newEmergencyBalance,
    allergies: card.allergies || null,
  };
  const message = totalEmergencyUsed > 0 ? 'Payment successful (emergency fund used)' : 'Payment successful';
  return isCart
    ? { status: 'approved', message, transactions, student }
    : { status: 'approved', message, transaction: transactions[0], student };
}

// Re-checks affordability (balance may have moved during the hold window),
// then debits and records exactly like the immediate path would have.
async function finalizePendingPurchase(pending) {
  const card = await db.prepare('SELECT * FROM students WHERE id = ?').get(pending.student_id);
  const totalAvailable = card.balance + (card.emergency_balance || 0);
  if (totalAvailable < pending.amount) {
    await db.prepare("UPDATE pending_purchases SET status = 'rejected' WHERE id = ?").run(pending.id);
    return { status: 'rejected', reason: 'Insufficient balance at approval time' };
  }

  const cartLines = pending.cart_json ? JSON.parse(pending.cart_json) : null;
  const lines = cartLines
    ? cartLines.map((l) => ({ amount: l.lineAmount, description: `${l.name} ×${l.quantity}`, itemId: l.itemId }))
    : [{ amount: pending.amount, description: pending.description, itemId: pending.item_id }];

  const { transactions, newBalance, newEmergencyBalance } = await debitAndRecord(card, lines, pending.merchant, pending.id);
  return paymentResponse(card, transactions, newBalance, newEmergencyBalance, !!cartLines);
}

// Looks up the outcome of an already-resolved (approved) pending purchase,
// so repeated cashier polls return the same result idempotently.
async function approvedResponseFor(pending) {
  const transactions = await db.prepare(
    'SELECT * FROM transactions WHERE pending_purchase_id = ? ORDER BY created_at ASC'
  ).all(pending.id);
  const student = await db.prepare(
    'SELECT * FROM students WHERE id = ?'
  ).get(pending.student_id);
  return paymentResponse(student, transactions, student.balance, student.emergency_balance, transactions.length > 1);
}

// GET /wallet/balance
router.get('/balance', authMiddleware, async (req, res) => {
  const student = await db.prepare(
    'SELECT id, name, email, class, balance, emergency_balance, allergies FROM students WHERE id = ?'
  ).get(req.user.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(student);
});

// GET /wallet/history
router.get('/history', authMiddleware, async (req, res) => {
  const txns = await db.prepare(
    'SELECT * FROM transactions WHERE student_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.user.id);
  res.json(txns);
});

// POST /wallet/topup  — admin only
router.post('/topup', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const { studentId, amount } = req.body;
  if (!studentId || !amount || amount <= 0) return res.status(400).json({ error: 'Invalid request' });

  const student = await db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const newBalance = student.balance + Number(amount);
  await db.prepare('UPDATE students SET balance = ? WHERE id = ?').run(newBalance, studentId);

  await db.prepare(`
    INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after)
    VALUES (?, ?, 'credit', ?, 'Wallet Top-Up', 'Parent/Admin', ?)
  `).run(uuidv4(), studentId, Number(amount), newBalance);

  res.json({ message: 'Wallet topped up', newBalance });
});

// POST /wallet/pay  — NFC payment
router.post('/pay', authMiddleware, async (req, res) => {
  const { amount, description, merchant } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  const student = await db.prepare('SELECT * FROM students WHERE id = ?').get(req.user.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const totalAvailable = student.balance + (student.emergency_balance || 0);
  if (totalAvailable < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // Draw from the main balance first; any shortfall is auto-covered by the emergency fund.
  const fromMain = Math.min(student.balance, Number(amount));
  const fromEmergency = Number(amount) - fromMain;
  const newBalance = student.balance - fromMain;
  const newEmergencyBalance = (student.emergency_balance || 0) - fromEmergency;
  await db.prepare('UPDATE students SET balance = ?, emergency_balance = ? WHERE id = ?')
    .run(newBalance, newEmergencyBalance, req.user.id);

  const txn = {
    id: uuidv4(),
    student_id: req.user.id,
    type: 'debit',
    amount: Number(amount),
    description: description || 'Payment',
    merchant: merchant || 'School',
    balance_after: newBalance,
    emergency_amount: fromEmergency,
  };

  await db.prepare(`
    INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after, emergency_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(txn.id, txn.student_id, txn.type, txn.amount, txn.description, txn.merchant, txn.balance_after, txn.emergency_amount);

  res.json({
    message: fromEmergency > 0 ? 'Payment successful (emergency fund used)' : 'Payment successful',
    transaction: txn,
    newBalance,
    emergencyBalance: newEmergencyBalance,
  });
});

// POST /wallet/pay-by-nfc — cashier terminal: uid + student PIN + amount
// (or a single menuItemId, or a cart of {menuItemId, quantity} lines)
router.post('/pay-by-nfc', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  let { uid, pin, amount, description, merchant, menuItemId, cart } = req.body;

  // Cart checkout: multiple menu items (each with a quantity) in one sale.
  // Resolves to one transaction row per cart line further down. The PIN,
  // balance, and daily-limit checks below run once against the cart's
  // combined total, same as the single-item/free-text paths.
  let menuItem = null;
  let cartLines = null;
  if (Array.isArray(cart) && cart.length > 0) {
    for (const line of cart) {
      if (!line.menuItemId || !Number.isInteger(line.quantity) || line.quantity <= 0) {
        return res.status(400).json({ error: 'Each cart line needs a menuItemId and a positive integer quantity' });
      }
    }
    const ids = [...new Set(cart.map((l) => l.menuItemId))];
    const placeholders = ids.map(() => '?').join(', ');
    const items = await db.prepare(
      `SELECT * FROM menu_items WHERE id IN (${placeholders}) AND active = 1 AND shop_owner_id = ?`
    ).all(...ids, req.user.id);
    if (items.length !== ids.length) {
      return res.status(404).json({ error: 'One or more menu items were not found or are inactive' });
    }

    const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
    cartLines = cart.map((line) => ({
      item: itemById[line.menuItemId],
      quantity: line.quantity,
      lineAmount: itemById[line.menuItemId].price * line.quantity,
    }));
    amount = cartLines.reduce((sum, l) => sum + l.lineAmount, 0);
  } else if (menuItemId) {
    // If a single menu item is selected, resolve its server-trusted price/name
    // up front. This only fills in `amount`/`description` when the cashier
    // omitted them — the PIN, balance, and daily-limit checks below are untouched.
    menuItem = await db.prepare(
      'SELECT * FROM menu_items WHERE id = ? AND active = 1 AND shop_owner_id = ?'
    ).get(menuItemId, req.user.id);
    if (!menuItem) return res.status(404).json({ error: 'Menu item not found or inactive' });
    if (amount === undefined || amount === null || amount === '') amount = menuItem.price;
    if (!description) description = menuItem.name;
  }

  if (!uid || !pin || !amount || amount <= 0) {
    return res.status(400).json({ error: 'uid, pin and amount are required' });
  }

  const card = await db.prepare(`
    SELECT s.*, c.uid FROM cards c
    JOIN students s ON s.id = c.student_id
    WHERE c.uid = ? AND c.active = 1
  `).get(uid);

  if (!card) return res.status(404).json({ error: 'Card not found or inactive' });

  const validPin = bcrypt.compareSync(String(pin), card.pin_hash);
  if (!validPin) return res.status(401).json({ error: 'Invalid PIN' });

  if (card.daily_limit_count != null || card.daily_limit_amount != null) {
    const today = await db.prepare(`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total
      FROM transactions
      WHERE student_id = ? AND type = 'debit' AND created_at::date = CURRENT_DATE
    `).get(card.id);

    const lineCount = cartLines ? cartLines.length : 1;
    if (card.daily_limit_count != null && today.count + lineCount > card.daily_limit_count) {
      const parent = await getParentFor(card);
      return res.status(400).json({ error: 'Daily transaction limit reached', parentPhone: parent?.phone || null });
    }
    if (card.daily_limit_amount != null && (today.total + Number(amount)) > card.daily_limit_amount) {
      const parent = await getParentFor(card);
      return res.status(400).json({ error: 'Daily spending limit exceeded', parentPhone: parent?.phone || null });
    }
  }

  const totalAvailable = card.balance + (card.emergency_balance || 0);
  if (totalAvailable < amount) {
    const parent = await getParentFor(card);
    return res.status(400).json({ error: 'Insufficient balance', parentPhone: parent?.phone || null });
  }

  // Junk-food purchases by grade-5-or-below students are held for parent
  // approval instead of being debited immediately. A cashier poll on
  // GET /wallet/pending/:id auto-approves once the timeout elapses, unless
  // the parent rejected it first via POST /parent/pending-approvals/:id/reject.
  const categoriesInvolved = cartLines
    ? [...new Set(cartLines.map((l) => l.item.category))]
    : (menuItem ? [menuItem.category] : []);

  if (needsJunkApproval(card.class, categoriesInvolved)) {
    const pendingId = uuidv4();
    const expiresAt = new Date(Date.now() + APPROVAL_TIMEOUT_MS);
    const holdDescription = cartLines
      ? cartLines.map((l) => `${l.item.name} ×${l.quantity}`).join(', ')
      : (description || 'Payment');
    const cartJson = cartLines
      ? JSON.stringify(cartLines.map((l) => ({ itemId: l.item.id, name: l.item.name, quantity: l.quantity, lineAmount: l.lineAmount })))
      : null;

    await db.prepare(`
      INSERT INTO pending_purchases (id, student_id, shop_owner_id, amount, description, merchant, item_id, cart_json, status, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      pendingId, card.id, req.user.id, Number(amount), holdDescription,
      merchant || 'School', menuItem ? menuItem.id : null, cartJson, expiresAt.toISOString()
    );

    return res.status(202).json({
      status: 'pending',
      pendingId,
      expiresAt: expiresAt.toISOString(),
      student: { name: card.name, class: card.class },
    });
  }

  const lines = cartLines
    ? cartLines.map((l) => ({ amount: l.lineAmount, description: `${l.item.name} ×${l.quantity}`, itemId: l.item.id }))
    : [{ amount: Number(amount), description: description || 'Payment', itemId: menuItem ? menuItem.id : null }];

  const { transactions, newBalance, newEmergencyBalance } = await debitAndRecord(card, lines, merchant);
  res.json(paymentResponse(card, transactions, newBalance, newEmergencyBalance, !!cartLines));
});

// GET /wallet/pending/:id — cashier polls this while waiting for a parent
// to reject a held junk-food purchase; auto-approves once the timeout passes.
router.get('/pending/:id', authMiddleware, shopOwnerMiddleware, async (req, res) => {
  const pending = await db.prepare(
    'SELECT * FROM pending_purchases WHERE id = ? AND shop_owner_id = ?'
  ).get(req.params.id, req.user.id);
  if (!pending) return res.status(404).json({ error: 'Pending purchase not found' });

  if (pending.status === 'rejected') return res.json({ status: 'rejected' });
  if (pending.status === 'approved') return res.json(await approvedResponseFor(pending));

  if (new Date(pending.expires_at) <= new Date()) {
    // Atomic claim: only one concurrent poll can flip pending -> approved.
    const claimed = await db.prepare(
      "UPDATE pending_purchases SET status = 'approved' WHERE id = ? AND status = 'pending' RETURNING *"
    ).get(pending.id);

    if (claimed) return res.json(await finalizePendingPurchase(claimed));

    // Lost the race — the parent rejected it (or another poll already
    // finalized it) in between our SELECT and UPDATE. Reflect the outcome.
    const settled = await db.prepare('SELECT * FROM pending_purchases WHERE id = ?').get(pending.id);
    if (settled.status === 'rejected') return res.json({ status: 'rejected' });
    return res.json(await approvedResponseFor(settled));
  }

  res.json({ status: 'pending', expiresAt: pending.expires_at });
});

module.exports = router;
