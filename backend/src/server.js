import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

dotenv.config();

const app = express();
const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../data');
const secret = process.env.JWT_SECRET;

if (!secret || secret.length < 32) {
  console.error(
    'Set JWT_SECRET to a random string of at least 32 characters in backend/.env'
  );
  process.exit(1);
}

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  })
);
app.use(express.json({ limit: '50kb' }));

const load = async (name) =>
  JSON.parse(await readFile(resolve(dataDir, `${name}.json`), 'utf8'));

const save = async (name, data) => {
  const filePath = resolve(dataDir, `${name}.json`);
  const tempPath = `${filePath}.tmp`;

  await writeFile(tempPath, JSON.stringify(data, null, 2));
  await rename(tempPath, filePath);
};

// Single-process JSON store: serialize writes across endpoints.
let writeQueue = Promise.resolve();

const mutate = (name, fn) => {
  const task = writeQueue.then(async () => {
    const data = await load(name);
    const result = await fn(data);
    await save(name, data);
    return result;
  });

  writeQueue = task.catch(() => {});
  return task;
};

const safeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});

const createToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, secret, { expiresIn: '12h' });

const auth = async (req, res, next) => {
  try {
    const tokenHeader = req.headers.authorization?.replace(/^Bearer /, '');

    if (!tokenHeader) {
      return res.status(401).json({ error: 'Login required' });
    }

    const payload = jwt.verify(tokenHeader, secret);
    const users = await load('users');
    const user = users.find((entry) => entry.id === payload.id);

    if (!user) {
      return res.status(401).json({ error: 'Account not found' });
    }

    req.user = safeUser(user);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
};

const role = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ error: 'Not authorized' });

const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const clean = (value) => String(value ?? '').trim();

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  })
);

app.post(
  '/api/auth/register',
  wrap(async (req, res) => {
    const name = clean(req.body.name);
    const email = clean(req.body.email).toLowerCase();
    const password = req.body.password;
    const roleName = req.body.role;

    if (
      name.length < 2 ||
      name.length > 80 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      typeof password !== 'string' ||
      password.length < 8 ||
      !['farmer', 'buyer'].includes(roleName)
    ) {
      return res.status(400).json({
        error: 'Provide a name, valid email, password (8+ chars) and farmer/buyer role',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await mutate('users', (users) => {
      if (users.some((entry) => entry.email === email)) {
        return null;
      }

      const newUser = {
        id: randomUUID(),
        name,
        email,
        passwordHash,
        role: roleName,
        createdAt: new Date().toISOString(),
      };

      users.push(newUser);
      return newUser;
    });

    if (!user) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    return res.status(201).json({ user: safeUser(user), token: createToken(user) });
  })
);

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const email = clean(req.body.email).toLowerCase();
    const password = req.body.password;
    const users = await load('users');
    const user = users.find((entry) => entry.email === email);

    if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    return res.json({ user: safeUser(user), token: createToken(user) });
  })
);

app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

app.get(
  '/api/listings',
  wrap(async (req, res) => {
    let items = await load('listings');
    const searchTerm = clean(req.query.q).toLowerCase();

    if (searchTerm) {
      items = items.filter((item) =>
        `${item.flower} ${item.location}`.toLowerCase().includes(searchTerm)
      );
    }

    return res.json(
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  })
);

app.post(
  '/api/listings',
  auth,
  role('farmer'),
  wrap(async (req, res) => {
    const flower = clean(req.body.flower);
    const location = clean(req.body.location);
    const unit = clean(req.body.unit || 'atte');
    const price = Number(req.body.price);
    const quantity = Number(req.body.quantity);

    if (
      !flower ||
      flower.length > 80 ||
      !location ||
      location.length > 100 ||
      !['atte', 'kg', 'bundle'].includes(unit) ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      return res.status(400).json({ error: 'Invalid listing details' });
    }

    const item = {
      id: randomUUID(),
      farmerId: req.user.id,
      farmerName: req.user.name,
      flower,
      location,
      unit,
      price,
      quantity,
      createdAt: new Date().toISOString(),
    };

    await mutate('listings', (listings) => {
      listings.push(item);
      return item;
    });

    return res.status(201).json(item);
  })
);

app.get(
  '/api/orders',
  auth,
  wrap(async (req, res) => {
    const orders = await load('orders');
    const visibleOrders = orders.filter(
      (order) =>
        req.user.role === 'admin' ||
        order.buyerId === req.user.id ||
        order.farmerId === req.user.id
    );

    return res.json(
      visibleOrders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  })
);

app.post(
  '/api/orders',
  auth,
  role('buyer'),
  wrap(async (req, res) => {
    const quantity = Number(req.body.quantity);
    const listingId = clean(req.body.listingId);

    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    // All listing stock changes and order writes run in a single serialized queue.
    const task = writeQueue.then(async () => {
      const listings = await load('listings');
      const orders = await load('orders');
      const item = listings.find((listing) => listing.id === listingId);

      if (!item) {
        return { error: 'Listing not found', code: 404 };
      }

      if (item.quantity < quantity) {
        return { error: 'Not enough stock', code: 409 };
      }

      item.quantity -= quantity;

      const order = {
        id: randomUUID(),
        listingId,
        flower: item.flower,
        unit: item.unit,
        price: item.price,
        quantity,
        total: item.price * quantity,
        buyerId: req.user.id,
        buyerName: req.user.name,
        farmerId: item.farmerId,
        farmerName: item.farmerName,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      orders.push(order);
      await save('listings', listings);
      await save('orders', orders);
      return { order };
    });

    writeQueue = task.catch(() => {});
    const result = await task;

    if (result.error) {
      return res.status(result.code).json({ error: result.error });
    }

    return res.status(201).json(result.order);
  })
);

app.patch(
  '/api/orders/:id/status',
  auth,
  role('farmer'),
  wrap(async (req, res) => {
    const status = clean(req.body.status);

    if (!['confirmed', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await mutate('orders', (orders) => {
      const order = orders.find(
        (entry) => entry.id === req.params.id && entry.farmerId === req.user.id
      );

      if (!order) {
        return null;
      }

      if ((status === 'confirmed' || status === 'rejected') && order.status !== 'pending') {
        return { error: 'Only pending orders can be confirmed or rejected' };
      }

      if (status === 'completed' && order.status !== 'confirmed') {
        return { error: 'Confirm order first' };
      }

      order.status = status;
      return order;
    });

    if (!result) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (result.error) {
      return res.status(409).json(result);
    }

    if (status === 'rejected') {
      await mutate('listings', (items) => {
        const item = items.find((entry) => entry.id === result.listingId);
        if (item) {
          item.quantity += result.quantity;
        }
        return items;
      });
    }

    return res.json(result);
  })
);

app.get(
  '/api/admin/summary',
  auth,
  role('admin'),
  wrap(async (req, res) =>
    res.json({
      users: (await load('users')).length,
      listings: (await load('listings')).length,
      orders: (await load('orders')).length,
    })
  )
);

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(Number(process.env.PORT) || 4000, () =>
  console.log('API running on http://localhost:' + (process.env.PORT || 4000))
);
