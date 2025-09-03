import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

let db;

async function initializeDatabase() {
  db = await open({
    filename: './server/data.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(cart_id) REFERENCES carts(id) ON DELETE CASCADE
    );
  `);
}

function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Yetkilendirme gerekli' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
  }
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
    const userId = result.lastID;
    await db.run('INSERT INTO carts (user_id) VALUES (?)', [userId]);
    const user = { id: userId, username };
    const token = createToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    if (String(err).includes('UNIQUE')) return res.status(409).json({ error: 'Kullanıcı adı zaten mevcut' });
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(401).json({ error: 'Geçersiz kimlik bilgileri' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Geçersiz kimlik bilgileri' });
    const token = createToken(user);
    res.json({ user: { id: user.id, username: user.username }, token });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.get('/api/cart', authMiddleware, async (req, res) => {
  try {
    const cart = await db.get('SELECT * FROM carts WHERE user_id = ?', [req.user.id]);
    if (!cart) return res.json({ items: [], total: 0 });
    const items = await db.all('SELECT id, product_name, unit_price, quantity FROM cart_items WHERE cart_id = ?', [cart.id]);
    const total = items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);
    res.json({ items, total });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.post('/api/cart/items', authMiddleware, async (req, res) => {
  try {
    const { productName, unitPrice, quantity } = req.body;
    if (!productName || !unitPrice || !quantity) return res.status(400).json({ error: 'Ürün adı, fiyat ve adet gerekli' });
    const cart = await db.get('SELECT * FROM carts WHERE user_id = ?', [req.user.id]);
    const existing = await db.get('SELECT * FROM cart_items WHERE cart_id = ? AND product_name = ?', [cart.id, productName]);
    if (existing) {
      await db.run('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?', [quantity, existing.id]);
    } else {
      await db.run('INSERT INTO cart_items (cart_id, product_name, unit_price, quantity) VALUES (?, ?, ?, ?)', [cart.id, productName, unitPrice, quantity]);
    }
    const items = await db.all('SELECT id, product_name, unit_price, quantity FROM cart_items WHERE cart_id = ?', [cart.id]);
    const total = items.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);
    res.status(201).json({ items, total });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

const PORT = process.env.PORT || 4000;

initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Database init error', err);
  process.exit(1);
});

