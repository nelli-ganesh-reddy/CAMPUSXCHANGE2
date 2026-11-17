import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { v2 as cloudinary } from 'cloudinary';
import { createHash, randomBytes } from 'node:crypto';

const app = express();
const port = Number(process.env.PORT || 4000);
const emailPattern = /^[^\s@]+@student\.nitw\.ac\.in$/i;
const databaseUrl = new URL(process.env.DATABASE_URL || 'mysql://user:password@localhost:3306/campusxchange');
const pool = mysql.createPool({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 3306),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: decodeURIComponent(databaseUrl.pathname.slice(1)),
  ...(process.env.DATABASE_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true
});

app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 200 }));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      verified_at DATETIME NULL,
      verification_hash CHAR(64) NULL,
      verification_expires DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      module ENUM('marketplace', 'lost_found') NOT NULL,
      type VARCHAR(20) NOT NULL,
      title VARCHAR(120) NOT NULL,
      description TEXT NOT NULL,
      category VARCHAR(60) NOT NULL,
      item_condition VARCHAR(30) NULL,
      price DECIMAL(10, 2) NULL,
      location VARCHAR(160) NULL,
      image_url VARCHAR(1000) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_posts_module_created (module, created_at),
      INDEX idx_posts_user (user_id)
    )
  `);
  await createDevelopmentTestUser();
}

async function createDevelopmentTestUser() {
  if (process.env.DEV_TEST_USER_ENABLED !== 'true') return;
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('DEV_TEST_USER_ENABLED can only be used when NODE_ENV=development.');
  }
  const name = 'CampusXchange Test User';
  const email = String(process.env.DEV_TEST_USER_EMAIL || '').trim().toLowerCase();
  const password = process.env.DEV_TEST_USER_PASSWORD || '';
  if (!emailPattern.test(email)) {
    throw new Error('DEV_TEST_USER_EMAIL must use the @student.nitw.ac.in domain.');
  }
  if (password.length < 12) {
    throw new Error('DEV_TEST_USER_PASSWORD must be at least 12 characters.');
  }
  const [result] = await pool.execute(
    'INSERT IGNORE INTO users (name, email, password_hash, verified_at) VALUES (?, ?, ?, UTC_TIMESTAMP())',
    [name, email, await bcrypt.hash(password, 12)]
  );
  if (result.affectedRows) console.log('Development test user created (credentials not logged).');
  else console.log('Development test user already exists; existing account was not changed.');
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function makeAuthToken(user) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ sub: String(user.id), email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

async function sendVerificationEmail(email, name, token) {
  const requiredEmailSettings = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'];
  const missingSettings = requiredEmailSettings.filter((setting) => !process.env[setting]);
  if (missingSettings.length) {
    throw new Error(`SMTP email is not configured. Set: ${missingSettings.join(', ')}.`);
  }
  const verifyUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
  verifyUrl.searchParams.set('token', token);
  const subject = 'Verify your CampusXchange email';
  const html = `<p>Hi ${escapeHtml(name)},</p><p>Confirm your NITW student email to activate your CampusXchange account.</p><p><a href="${escapeHtml(verifyUrl.toString())}">Verify my email</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this message.</p>`;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({ from: process.env.EMAIL_FROM, to: email, subject, html });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Enter your name (2–100 characters).' });
  if (!emailPattern.test(email)) return res.status(400).json({ error: 'Use your NITW student email ending in @student.nitw.ac.in.' });
  if (password.length < 8) return res.status(400).json({ error: 'Choose a password with at least 8 characters.' });
  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) return res.status(409).json({ error: 'An account already uses this email. Try signing in.' });

  const token = randomBytes(32).toString('hex');
  const [result] = await pool.execute(
    'INSERT INTO users (name, email, password_hash, verification_hash, verification_expires) VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))',
    [name, email, await bcrypt.hash(password, 12), hashToken(token)]
  );
  try {
    await sendVerificationEmail(email, name, token);
  } catch (error) {
    await pool.execute('DELETE FROM users WHERE id = ?', [result.insertId]);
    throw error;
  }
  res.status(201).json({ message: 'Check your NITW inbox for a verification link. It expires in 30 minutes.' });
}));

app.post('/api/auth/verify', asyncRoute(async (req, res) => {
  const token = String(req.body.token || '');
  if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ error: 'This verification link is invalid or expired.' });
  const [result] = await pool.execute(
    'UPDATE users SET verified_at = UTC_TIMESTAMP(), verification_hash = NULL, verification_expires = NULL WHERE verification_hash = ? AND verification_expires > UTC_TIMESTAMP()',
    [hashToken(token)]
  );
  if (!result.affectedRows) return res.status(400).json({ error: 'This verification link is invalid or expired. Please register again.' });
  res.json({ message: 'Email verified. You can now sign in.' });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!emailPattern.test(email)) return res.status(400).json({ error: 'Use your NITW student email ending in @student.nitw.ac.in.' });
  const [rows] = await pool.execute('SELECT id, name, email, password_hash, verified_at FROM users WHERE email = ?', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  if (!user.verified_at) return res.status(403).json({ error: 'Verify your email from the link sent to your inbox before signing in.' });
  res.json({ token: makeAuthToken(user), user: { id: user.id, name: user.name, email: user.email } });
}));

app.get('/api/posts', asyncRoute(async (req, res) => {
  const moduleName = ['marketplace', 'lost_found'].includes(req.query.module) ? req.query.module : null;
  const search = String(req.query.search || '').trim().slice(0, 100);
  const category = String(req.query.category || '').trim().slice(0, 60);
  const type = String(req.query.type || '').trim().slice(0, 20);
  const conditions = ['p.status = ?'];
  const params = ['active'];
  if (moduleName) { conditions.push('p.module = ?'); params.push(moduleName); }
  if (search) { conditions.push('(p.title LIKE ? OR p.description LIKE ? OR p.location LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (category) { conditions.push('p.category = ?'); params.push(category); }
  if (type) { conditions.push('p.type = ?'); params.push(type); }
  const [posts] = await pool.execute(
    `SELECT p.id, p.module, p.type, p.title, p.description, p.category, p.item_condition AS itemCondition, p.price, p.location, p.image_url AS imageUrl, p.status, p.created_at AS createdAt, u.name AS sellerName
     FROM posts p JOIN users u ON u.id = p.user_id WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC LIMIT 100`,
    params
  );
  res.json({ posts });
}));

app.get('/api/posts/mine', requireAuth, asyncRoute(async (req, res) => {
  const [posts] = await pool.execute(
    `SELECT id, module, type, title, description, category, item_condition AS itemCondition, price, location, image_url AS imageUrl, status, created_at AS createdAt
     FROM posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
    [req.user.sub]
  );
  res.json({ posts });
}));

app.get('/api/posts/:id/contact', requireAuth, asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT p.user_id AS userId, p.status, u.name AS sellerName, u.email AS sellerEmail
     FROM posts p JOIN users u ON u.id = p.user_id
     WHERE p.id = ? AND (p.status = 'active' OR p.user_id = ?)`,
    [req.params.id, req.user.sub]
  );
  const post = rows[0];
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (String(post.userId) === String(req.user.sub)) {
    return res.json({ sellerName: post.sellerName, isOwner: true });
  }
  res.json({ sellerName: post.sellerName, contactEmail: post.sellerEmail, isOwner: false });
}));

app.post('/api/posts', requireAuth, asyncRoute(async (req, res) => {
  const { module, type, title, description, category, itemCondition, price, location, imageUrl } = req.body;
  const validModule = ['marketplace', 'lost_found'].includes(module);
  const validType = module === 'marketplace' ? ['sell', 'exchange', 'free'].includes(type) : ['lost', 'found'].includes(type);
  if (!validModule || !validType) return res.status(400).json({ error: 'Choose a valid post type.' });
  const cleanTitle = String(title || '').trim();
  const cleanDescription = String(description || '').trim();
  const cleanCategory = String(category || '').trim();
  if (cleanTitle.length < 3 || cleanTitle.length > 120 || cleanDescription.length < 5 || cleanDescription.length > 4000 || !cleanCategory) {
    return res.status(400).json({ error: 'Add a title, category, and description (5–4,000 characters).' });
  }
  const parsedPrice = price === '' || price == null ? null : Number(price);
  if (module === 'marketplace' && type === 'sell' && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
    return res.status(400).json({ error: 'Enter a valid non-negative price for an item for sale.' });
  }
  const safeImageUrl = imageUrl ? String(imageUrl).slice(0, 1000) : null;
  if (safeImageUrl && !/^https:\/\/res\.cloudinary\.com\//i.test(safeImageUrl)) {
    return res.status(400).json({ error: 'Upload photos using the image upload button.' });
  }
  const [result] = await pool.execute(
    `INSERT INTO posts (user_id, module, type, title, description, category, item_condition, price, location, image_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.sub, module, type, cleanTitle, cleanDescription, cleanCategory, itemCondition || null,
      module === 'marketplace' && type === 'sell' ? parsedPrice : null, String(location || '').trim().slice(0, 160) || null, safeImageUrl]
  );
  res.status(201).json({ id: result.insertId, message: 'Your post is live.' });
}));

app.patch('/api/posts/:id', requireAuth, asyncRoute(async (req, res) => {
  const { module, type, title, description, category, itemCondition, price, location, imageUrl } = req.body;
  const validModule = ['marketplace', 'lost_found'].includes(module);
  const validType = module === 'marketplace' ? ['sell', 'exchange', 'free'].includes(type) : ['lost', 'found'].includes(type);
  if (!validModule || !validType) return res.status(400).json({ error: 'Choose a valid post type.' });
  const cleanTitle = String(title || '').trim();
  const cleanDescription = String(description || '').trim();
  const cleanCategory = String(category || '').trim();
  if (cleanTitle.length < 3 || cleanTitle.length > 120 || cleanDescription.length < 5 || cleanDescription.length > 4000 || !cleanCategory) {
    return res.status(400).json({ error: 'Add a title, category, and description (5–4,000 characters).' });
  }
  const parsedPrice = price === '' || price == null ? null : Number(price);
  if (module === 'marketplace' && type === 'sell' && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
    return res.status(400).json({ error: 'Enter a valid non-negative price for an item for sale.' });
  }
  const safeImageUrl = imageUrl ? String(imageUrl).slice(0, 1000) : null;
  if (safeImageUrl && !/^https:\/\/res\.cloudinary\.com\//i.test(safeImageUrl)) {
    return res.status(400).json({ error: 'Upload photos using the image upload button.' });
  }
  const [result] = await pool.execute(
    `UPDATE posts SET module = ?, type = ?, title = ?, description = ?, category = ?, item_condition = ?, price = ?, location = ?, image_url = ?
     WHERE id = ? AND user_id = ?`,
    [module, type, cleanTitle, cleanDescription, cleanCategory, itemCondition || null,
      module === 'marketplace' && type === 'sell' ? parsedPrice : null, String(location || '').trim().slice(0, 160) || null, safeImageUrl,
      req.params.id, req.user.sub]
  );
  if (!result.affectedRows) {
    const [existing] = await pool.execute('SELECT id FROM posts WHERE id = ? AND user_id = ?', [req.params.id, req.user.sub]);
    if (!existing.length) return res.status(404).json({ error: 'Post not found.' });
  }
  res.json({ message: 'Post updated.' });
}));

app.patch('/api/posts/:id/status', requireAuth, asyncRoute(async (req, res) => {
  const status = String(req.body.status || '');
  if (!['active', 'resolved', 'sold'].includes(status)) return res.status(400).json({ error: 'Choose a valid status.' });
  const [result] = await pool.execute('UPDATE posts SET status = ? WHERE id = ? AND user_id = ?', [status, req.params.id, req.user.sub]);
  if (!result.affectedRows) {
    const [existing] = await pool.execute('SELECT id FROM posts WHERE id = ? AND user_id = ?', [req.params.id, req.user.sub]);
    if (!existing.length) return res.status(404).json({ error: 'Post not found.' });
  }
  res.json({ message: 'Post status updated.' });
}));

app.delete('/api/posts/:id', requireAuth, asyncRoute(async (req, res) => {
  const [result] = await pool.execute('DELETE FROM posts WHERE id = ? AND user_id = ?', [req.params.id, req.user.sub]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Post not found.' });
  res.json({ message: 'Post deleted.' });
}));

app.post('/api/images', requireAuth, (req, res, next) => {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('image');
  upload(req, res, (error) => {
    if (error) return res.status(400).json({ error: 'Choose an image smaller than 5 MB.' });
    next();
  });
}, asyncRoute(async (req, res) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    return res.status(503).json({ error: 'Photo uploads are not configured yet. Add the Cloudinary credentials to the server.' });
  }
  if (!req.file || !req.file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Choose an image file.' });
  try {
    const url = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: 'campusxchange', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] }, (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      });
      stream.end(req.file.buffer);
    });
    res.json({ imageUrl: url });
  } catch (error) {
    const providerMessage = error?.error?.message || error?.message || 'Unknown Cloudinary error';
    console.error('Cloudinary image upload failed:', providerMessage);
    res.status(502).json({
      error: 'Cloudinary could not store the image. Check that the Cloud name, API key, and API secret all come from the same Cloudinary account.'
    });
  }
}));

app.use((error, req, res, next) => {
  console.error(error);
  if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That email is already registered.' });
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

await initializeDatabase();
app.listen(port, () => console.log(`CampusXchange API listening on port ${port}`));
