const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { db, withTransaction } = require('../db/schema');
const { authMiddleware, shopOwnerMiddleware } = require('../middleware/auth');
const { getParentFor } = require('../services/family');
const { needsJunkApproval, APPROVAL_TIMEOUT_MS } = require('../services/approval');
const { isLocked, lockedResponse, recordFailedAttempt, recordSuccess } = require('../services/pinAuth');
const { parseAmount } = require('../utils/validate');
const { HttpError } = require('../utils/errors');

// Sequentially debits one or more line items against a student's balance
// (falling back to the emergency fund per line), inserting one transaction
// row per line. Shared by the immediate pay-by-nfc path and the deferred
// parent-approval path (finalizePendingPurchase), so both debit identically.
// `trx` must be a withTransaction()-scoped db handle bound to a connection
// that already holds a row lock (SELECT ... FOR UPDATE) on `card` — callers
// are responsible for acquiring that lock before calling this. `orderId`
// stamps each transaction row with the `orders` row this sale belongs to.
async function debitAndRecord(trx, card, lines, merchant, pendingPurchaseId = null, orderId = null) {
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
      order_id: orderId,
      created_at: createdAt,
    };
    await trx.prepare(`
      INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after, emergency_amount, item_id, pending_purchase_id, order_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      txn.id, txn.student_id, txn.type, txn.amount, txn.description, txn.merchant,
      txn.balance_after, txn.emergency_amount, txn.item_id, txn.pending_purchase_id, txn.order_id
    );
    transactions.push(txn);
  }

  await trx.prepare('UPDATE students SET balance = ?, emergency_balance = ? WHERE id = ?')
    .run(runningBalance, runningEmergency, card.id);

  return { transactions, newBalance: runningBalance, newEmergencyBalance: runningEmergency };
}

// Snapshot of what was sold, stored on orders.items (jsonb) — independent of
// the per-line transaction rows so the seller order list has one place to
// read "what was in this sale" without joining transactions.
function orderItemsSnapshot(cartLines, menuItem, amount, description) {
  if (cartLines) {
    return cartLines.map((l) => ({ itemId: l.item.id, name: l.item.name, quantity: l.quantity, lineAmount: l.lineAmount }));
  }
  return [{ itemId: menuItem ? menuItem.id : null, name: description || 'Payment', quantity: 1, lineAmount: amount }];
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
// then debits and records exactly like the immediate path would have. Runs
// its own transaction + row lock since it's called well after the original
// pay-by-nfc request's lock (if any) has been released.
async function finalizePendingPurchase(pending) {
  return withTransaction(async (trx) => {
    const card = await trx.prepare('SELECT * FROM students WHERE id = ? FOR UPDATE').get(pending.student_id);
    const order = await trx.prepare('SELECT id FROM orders WHERE pending_purchase_id = ?').get(pending.id);

    const totalAvailable = card.balance + (card.emergency_balance || 0);
    if (totalAvailable < pending.amount) {
      await trx.prepare("UPDATE pending_purchases SET status = 'rejected', resolved_at = NOW() WHERE id = ?").run(pending.id);
      if (order) await trx.prepare("UPDATE orders SET status = 'rejected' WHERE id = ?").run(order.id);
      return { status: 'rejected', reason: 'Insufficient balance at approval time' };
    }

    const cartLines = pending.cart_json ? JSON.parse(pending.cart_json) : null;
    const lines = cartLines
      ? cartLines.map((l) => ({ amount: l.lineAmount, description: `${l.name} ×${l.quantity}`, itemId: l.itemId }))
      : [{ amount: pending.amount, description: pending.description, itemId: pending.item_id }];

    const { transactions, newBalance, newEmergencyBalance } = await debitAndRecord(
      trx, card, lines, pending.merchant, pending.id, order ? order.id : null
    );
    if (order) await trx.prepare("UPDATE orders SET status = 'completed' WHERE id = ?").run(order.id);
    return paymentResponse(card, transactions, newBalance, newEmergencyBalance, !!cartLines);
  });
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
  const { studentId } = req.body;
  const amount = parseAmount(req.body.amount);
  if (!studentId || amount === null) return res.status(400).json({ error: 'Invalid request' });

  try {
    const result = await withTransaction(async (trx) => {
      const student = await trx.prepare('SELECT * FROM students WHERE id = ? FOR UPDATE').get(studentId);
      if (!student) throw new HttpError(404, 'Student not found');

      const newBalance = student.balance + amount;
      await trx.prepare('UPDATE students SET balance = ? WHERE id = ?').run(newBalance, studentId);
      await trx.prepare(`
        INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after)
        VALUES (?, ?, 'credit', ?, 'Wallet Top-Up', 'Parent/Admin', ?)
      `).run(uuidv4(), studentId, amount, newBalance);

      return { message: 'Wallet topped up', newBalance };
    });
    res.json(result);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body);
    throw err;
  }
});

// POST /wallet/pay  — NFC payment
router.post('/pay', authMiddleware, async (req, res) => {
  const amount = parseAmount(req.body.amount);
  if (amount === null) return res.status(400).json({ error: 'Invalid amount' });
  const { description, merchant } = req.body;

  try {
    const result = await withTransaction(async (trx) => {
      const student = await trx.prepare('SELECT * FROM students WHERE id = ? FOR UPDATE').get(req.user.id);
      if (!student) throw new HttpError(404, 'Student not found');

      const totalAvailable = student.balance + (student.emergency_balance || 0);
      if (totalAvailable < amount) throw new HttpError(400, 'Insufficient balance');

      // Draw from the main balance first; any shortfall is auto-covered by the emergency fund.
      const fromMain = Math.min(student.balance, amount);
      const fromEmergency = amount - fromMain;
      const newBalance = student.balance - fromMain;
      const newEmergencyBalance = (student.emergency_balance || 0) - fromEmergency;
      await trx.prepare('UPDATE students SET balance = ?, emergency_balance = ? WHERE id = ?')
        .run(newBalance, newEmergencyBalance, req.user.id);

      const txn = {
        id: uuidv4(),
        student_id: req.user.id,
        type: 'debit',
        amount,
        description: description || 'Payment',
        merchant: merchant || 'School',
        balance_after: newBalance,
        emergency_amount: fromEmergency,
      };
      await trx.prepare(`
        INSERT INTO transactions (id, student_id, type, amount, description, merchant, balance_after, emergency_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(txn.id, txn.student_id, txn.type, txn.amount, txn.description, txn.merchant, txn.balance_after, txn.emergency_amount);

      return {
        message: fromEmergency > 0 ? 'Payment successful (emergency fund used)' : 'Payment successful',
        transaction: txn,
        newBalance,
        emergencyBalance: newEmergencyBalance,
      };
    });
    res.json(result);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body);
    throw err;
  }
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

  amount = parseAmount(amount);
  if (!uid || !pin || amount === null) {
    return res.status(400).json({ error: 'uid, pin and amount are required' });
  }

  // PIN check and lockout bookkeeping happen outside the payment transaction
  // and always commit immediately (via the module-level `db`, not `trx`) —
  // a failed attempt must be recorded even when the payment itself is later
  // rejected/rolled back for an unrelated reason.
  const card = await db.prepare(`
    SELECT s.*, c.uid FROM cards c
    JOIN students s ON s.id = c.student_id
    WHERE c.uid = ? AND c.active = 1
  `).get(uid);

  if (!card) return res.status(404).json({ error: 'Card not found or inactive' });

  if (isLocked(card)) {
    const { status, body } = lockedResponse(card);
    return res.status(status).json(body);
  }

  const validPin = bcrypt.compareSync(String(pin), card.pin_hash);
  if (!validPin) {
    await recordFailedAttempt(db, card.id);
    return res.status(401).json({ error: 'Invalid PIN' });
  }
  await recordSuccess(db, card.id);

  // Every sale needs a shop to attach its `orders` row to — resolved once
  // here rather than inside the transaction below since it never changes
  // mid-request and isn't part of the balance/limit read-modify-write.
  const cashierShop = await db.prepare('SELECT shop_id FROM students WHERE id = ?').get(req.user.id);
  if (!cashierShop?.shop_id) {
    return res.status(400).json({ error: 'Your account is not linked to a shop — contact your school admin' });
  }
  const shopId = cashierShop.shop_id;

  const categoriesInvolved = cartLines
    ? [...new Set(cartLines.map((l) => l.item.category))]
    : (menuItem ? [menuItem.category] : []);

  try {
    const result = await withTransaction(async (trx) => {
      // Re-fetch under a row lock: balance/daily-limit checks must run
      // against the current committed state, and no other request may
      // read-modify-write this student's balance until we commit/rollback.
      const lockedCard = await trx.prepare('SELECT * FROM students WHERE id = ? FOR UPDATE').get(card.id);

      if (lockedCard.daily_limit_count != null || lockedCard.daily_limit_amount != null) {
        const today = await trx.prepare(`
          SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total
          FROM transactions
          WHERE student_id = ? AND type = 'debit' AND created_at::date = CURRENT_DATE
        `).get(lockedCard.id);

        const lineCount = cartLines ? cartLines.length : 1;
        if (lockedCard.daily_limit_count != null && today.count + lineCount > lockedCard.daily_limit_count) {
          const parent = await getParentFor(lockedCard);
          throw new HttpError(400, { error: 'Daily transaction limit reached', parentPhone: parent?.phone || null });
        }
        if (lockedCard.daily_limit_amount != null && (today.total + amount) > lockedCard.daily_limit_amount) {
          const parent = await getParentFor(lockedCard);
          throw new HttpError(400, { error: 'Daily spending limit exceeded', parentPhone: parent?.phone || null });
        }
      }

      const totalAvailable = lockedCard.balance + (lockedCard.emergency_balance || 0);
      if (totalAvailable < amount) {
        const parent = await getParentFor(lockedCard);
        throw new HttpError(400, { error: 'Insufficient balance', parentPhone: parent?.phone || null });
      }

      // Junk-food purchases by grade-5-or-below students are held for parent
      // approval instead of being debited immediately. A cashier poll on
      // GET /wallet/pending/:id auto-approves once the timeout elapses, unless
      // the parent rejected it first via POST /parent/pending-approvals/:id/reject.
      if (needsJunkApproval(lockedCard.class, categoriesInvolved)) {
        const pendingId = uuidv4();
        const expiresAt = new Date(Date.now() + APPROVAL_TIMEOUT_MS);
        const holdDescription = cartLines
          ? cartLines.map((l) => `${l.item.name} ×${l.quantity}`).join(', ')
          : (description || 'Payment');
        const cartJson = cartLines
          ? JSON.stringify(cartLines.map((l) => ({ itemId: l.item.id, name: l.item.name, quantity: l.quantity, lineAmount: l.lineAmount })))
          : null;

        await trx.prepare(`
          INSERT INTO pending_purchases (id, student_id, shop_owner_id, amount, description, merchant, item_id, cart_json, status, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `).run(
          pendingId, lockedCard.id, req.user.id, amount, holdDescription,
          merchant || 'School', menuItem ? menuItem.id : null, cartJson, expiresAt.toISOString()
        );

        const orderId = uuidv4();
        await trx.prepare(`
          INSERT INTO orders (id, shop_id, student_id, cashier_id, items, amount, status, pending_purchase_id)
          VALUES (?, ?, ?, ?, ?, ?, 'pending_approval', ?)
        `).run(
          orderId, shopId, lockedCard.id, req.user.id,
          JSON.stringify(orderItemsSnapshot(cartLines, menuItem, amount, description)), amount, pendingId
        );

        return {
          pending: true,
          payload: {
            status: 'pending',
            pendingId,
            expiresAt: expiresAt.toISOString(),
            student: { name: lockedCard.name, class: lockedCard.class },
          },
        };
      }

      const lines = cartLines
        ? cartLines.map((l) => ({ amount: l.lineAmount, description: `${l.item.name} ×${l.quantity}`, itemId: l.item.id }))
        : [{ amount, description: description || 'Payment', itemId: menuItem ? menuItem.id : null }];

      const orderId = uuidv4();
      await trx.prepare(`
        INSERT INTO orders (id, shop_id, student_id, cashier_id, items, amount, status)
        VALUES (?, ?, ?, ?, ?, ?, 'completed')
      `).run(
        orderId, shopId, lockedCard.id, req.user.id,
        JSON.stringify(orderItemsSnapshot(cartLines, menuItem, amount, description)), amount
      );

      const { transactions, newBalance, newEmergencyBalance } = await debitAndRecord(trx, lockedCard, lines, merchant, null, orderId);
      return { pending: false, payload: paymentResponse(lockedCard, transactions, newBalance, newEmergencyBalance, !!cartLines) };
    });

    res.status(result.pending ? 202 : 200).json(result.payload);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body);
    throw err;
  }
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
      "UPDATE pending_purchases SET status = 'approved', resolved_at = NOW() WHERE id = ? AND status = 'pending' RETURNING *"
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
