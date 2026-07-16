import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { EMAIL_RE, PIN_RE } from '../utils/validate.js';
import { HttpError } from '../utils/errors.js';

export async function assertEmailFree(db, email) {
  const existing = await db.prepare('SELECT id FROM students WHERE email = ?').get(email);
  if (existing) throw new HttpError(409, 'Email already registered');
}

// Shared by the self-service POST /auth/register (role='shop_owner' branch)
// and the school-admin-driven POST /admin/shop-owners — one implementation,
// two entry points, so the validation/creation rules never drift apart.
//
// Either `shopId` (assign to an existing shop, admin-only path) or
// `merchantName` (create a brand-new shop, used by self-registration and by
// admin when standing up a new shop's first cashier) must be given.
export async function createShopOwnerAccount(db, { name, email, pin, merchantName, phone, shopId }) {
  if (!name || !email || !pin || (!merchantName && !shopId)) {
    throw new HttpError(400, 'name, email, pin and merchantName (or shopId) are required');
  }
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address');
  if (!PIN_RE.test(String(pin))) throw new HttpError(400, 'PIN must be 4-6 digits');

  await assertEmailFree(db, email);

  let shop;
  if (shopId) {
    shop = await db.prepare('SELECT id, name FROM shops WHERE id = ?').get(shopId);
    if (!shop) throw new HttpError(404, 'Shop not found');
  } else {
    const newShopId = 'shop-' + uuidv4().slice(0, 8);
    await db.prepare('INSERT INTO shops (id, name) VALUES (?, ?)').run(newShopId, merchantName);
    shop = { id: newShopId, name: merchantName };
  }

  const id = 'owner-' + uuidv4().slice(0, 8);
  const pinHash = bcrypt.hashSync(String(pin), 10);

  await db
    .prepare(
      `
    INSERT INTO students (id, name, email, class, balance, pin_hash, role, merchant_name, phone, shop_id)
    VALUES (?, ?, ?, 'Staff', 0, ?, 'shop_owner', ?, ?, ?)
  `
    )
    .run(id, name, email, pinHash, shop.name, phone || null, shop.id);

  return {
    id,
    name,
    email,
    class: 'Staff',
    balance: 0,
    role: 'shop_owner',
    merchant_name: shop.name,
    phone: phone || null,
    shop_id: shop.id,
  };
}
