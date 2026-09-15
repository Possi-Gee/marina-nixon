-- ============================================================
-- Marina Nixon Clothing Database Schema
-- SQLite version for the Node.js backend in /backend/server.js
-- ============================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password TEXT NOT NULL,
  address TEXT,
  city TEXT,
  region TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  price REAL NOT NULL,
  old_price REAL,
  badge TEXT,
  stock INTEGER NOT NULL DEFAULT 50,
  description TEXT,
  sizes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  order_number TEXT NOT NULL UNIQUE,
  total REAL NOT NULL,
  shipping_cost REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing',
  payment_method TEXT,
  delivery_method TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price REAL NOT NULL,
  size TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS wishlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT,
  transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);

-- ============================================================
-- Seed data
-- ============================================================

INSERT OR IGNORE INTO users (
  id, first_name, last_name, email, phone, password, address, city, region, role, is_verified
) VALUES (
  1,
  'Marina',
  'Nixon',
  'admin@marinanixon.com',
  '+233000000000',
  '$2a$10$OqKzQitjTBiBOPZiKk/Oj.qYeafotNguvnMlHocAgZCPK/9sprqAW',
  NULL,
  NULL,
  NULL,
  'admin',
  1
);

INSERT OR IGNORE INTO products (
  id, name, category, label, price, old_price, badge, stock, description, sizes
) VALUES
  (1, 'Noir Gown', 'evening', 'Evening Wear', 850, NULL, 'new', 15, 'Signature evening gown.', '["XS","S","M","L","XL"]'),
  (2, 'Velour Dress', 'evening', 'Evening Wear', 620, NULL, NULL, 20, 'Elegant velour dress.', '["S","M","L"]'),
  (3, 'Linen Blazer', 'casual', 'Casual Luxe', 480, NULL, 'best', 25, 'Tailored linen blazer.', '["S","M","L","XL"]'),
  (4, 'Classic Trench', 'heritage', 'Heritage Line', 920, NULL, NULL, 12, 'Classic long trench coat.', '["S","M","L"]'),
  (5, 'Oxford Shirt', 'men', 'Men''s Collection', 380, NULL, 'new', 28, 'Sharp Oxford shirt.', '["M","L","XL"]');
