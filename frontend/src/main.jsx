import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Flower2,
  ShoppingBasket,
  ShieldCheck,
  Leaf,
  LogOut,
  Plus,
  Search,
  Truck,
  IndianRupee,
  Menu,
  ArrowRight,
} from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('bloom_token') || '');
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('market');
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);

  const request = async (path, options = {}) => {
    const response = await fetch(API + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  };

  const refresh = async () => {
    try {
      const listings = await request('/listings');
      setItems(listings);

      if (token) {
        setOrders(await request('/orders'));
      }

      if (user?.role === 'admin') {
        setSummary(await request('/admin/summary'));
      }
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    if (token) {
      request('/auth/me')
        .then((data) => setUser(data.user))
        .catch(() => logout());
      return;
    }

    setUser(null);
  }, [token]);

  useEffect(() => {
    refresh();
  }, [token, user?.role]);

  const logout = () => {
    localStorage.removeItem('bloom_token');
    setToken('');
    setUser(null);
    setOrders([]);
    setPage('market');
  };

  const submitAuth = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    const form = event.currentTarget;
    const formData = Object.fromEntries(new FormData(form));

    try {
      const result = await request('/auth/' + authMode, {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      localStorage.setItem('bloom_token', result.token);
      setToken(result.token);
      setUser(result.user);
      setPage('dashboard');
      setMessage('Welcome to BloomBridge!');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const createListing = async (event) => {
    event.preventDefault();
    setBusy(true);

    const form = event.currentTarget;

    try {
      const formData = Object.fromEntries(new FormData(form));
      await request('/listings', {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      form.reset();
      setMessage('Listing published successfully');
      setPage('market');
      await refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const placeOrder = async (item) => {
    const quantity = prompt(
      `How many ${item.unit}(s) of ${item.flower}? Available: ${item.quantity}`,
      '1'
    );

    if (quantity === null) {
      return;
    }

    try {
      await request('/orders', {
        method: 'POST',
        body: JSON.stringify({
          listingId: item.id,
          quantity: Number(quantity),
        }),
      });

      setMessage('Order placed! Awaiting farmer confirmation.');
      await refresh();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const updateOrder = async (id, status) => {
    try {
      await request('/orders/' + id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });

      setMessage('Order updated');
      await refresh();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const nav = (label, target, Icon) => (
    <button
      key={target}
      className={page === target ? 'nav active' : 'nav'}
      onClick={() => {
        setPage(target);
        setMobile(false);
      }}
    >
      <Icon size={18} />
      {label}
    </button>
  );

  const filteredItems = items.filter((item) =>
    `${item.flower} ${item.location}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="app">
      <aside className={mobile ? 'sidebar expanded' : 'sidebar'}>
        <div className="brand">
          <div className="brandmark">
            <Flower2 size={24} />
          </div>
          <span>
            Bloom<span className="green">Bridge</span>
            <small>FARM TO MARKET</small>
          </span>
        </div>

        <div className="navlabel">EXPLORE</div>
        {nav('Marketplace', 'market', ShoppingBasket)}
        {user && nav('My Dashboard', 'dashboard', Leaf)}
        {user?.role === 'farmer' && nav('Add Listing', 'new', Plus)}
        {user && nav('My Orders', 'orders', Truck)}

        <div className="sidebottom">
          <div className="sidequote">
            “Better prices.<br />
            Stronger roots.”
            <span>
              Connecting Udupi&apos;s growers with buyers who value their harvest.
            </span>
          </div>

          {user ? (
            <button className="nav" onClick={logout}>
              <LogOut size={18} /> Sign out
            </button>
          ) : (
            nav('Login / Register', 'auth', ShieldCheck)
          )}
        </div>
      </aside>

      <main>
        <header>
          <button className="hamburger" onClick={() => setMobile(!mobile)}>
            <Menu />
          </button>

          <div className="headerleft">
            <span className="eyebrow">UDUPI FLORICULTURE NETWORK</span>
            <strong>Fresh blooms. Fair futures.</strong>
          </div>

          <div className="headright">
            <span className="live">
              <span className="dot" /> Marketplace live
            </span>
            {user ? (
              <button className="userpill" onClick={() => setPage('dashboard')}>
                {user.name[0].toUpperCase()} <span>{user.name}</span>
              </button>
            ) : (
              <button className="btn small" onClick={() => setPage('auth')}>
                Get started <ArrowRight size={15} />
              </button>
            )}
          </div>
        </header>

        <div className="content">
          {message && (
            <div className="notice" onClick={() => setMessage('')}>
              {message}
              <span>×</span>
            </div>
          )}

          {page === 'market' && (
            <>
              <section className="hero">
                <div className="herocopy">
                  <div className="heroeyebrow">
                    <Leaf size={15} /> GROWN WITH CARE, SOLD WITH CONFIDENCE
                  </div>
                  <h1>
                    Where every bloom
                    <br />
                    <em>finds its value.</em>
                  </h1>
                  <p>
                    A fair, transparent marketplace connecting Udupi&apos;s flower growers directly with buyers.
                    Less waste. Better livelihoods. Fresher flowers.
                  </p>
                  <button
                    className="btn cream"
                    onClick={() => setPage(user?.role === 'farmer' ? 'new' : user ? 'dashboard' : 'auth')}
                  >
                    {user?.role === 'farmer' ? 'List your flowers' : 'Join the marketplace'}
                    <ArrowRight size={17} />
                  </button>
                </div>

                <div className="heroart">
                  <div className="flowerillustration">✿</div>
                  <div className="flowerillustration second">✿</div>
                  <div className="heroarttext">
                    UDUPI
                    <br />
                    MALLIGE
                    <span>GI TAGGED HERITAGE</span>
                  </div>
                </div>
              </section>

              <div className="stats">
                <div>
                  <strong>100%</strong>
                  <span>Transparent listing prices</span>
                </div>
                <div>
                  <strong>Direct</strong>
                  <span>Farmer-to-buyer connections</span>
                </div>
                <div>
                  <strong>Local</strong>
                  <span>Udupi-grown flowers</span>
                </div>
              </div>

              <div className="sectiontop">
                <div>
                  <span className="eyebrow green">THE FLOWER EXCHANGE</span>
                  <h2>Fresh from the growers</h2>
                  <p>Discover flowers available directly from local farms.</p>
                </div>
                <div className="search">
                  <Search size={18} />
                  <input
                    placeholder="Search flowers or locations"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </div>

              <div className="cards">
                {filteredItems.map((item) => (
                  <article className="product" key={item.id}>
                    <div className="productimage">
                      <span>✿</span>
                      <label>FARM FRESH</label>
                    </div>

                    <div className="productbody">
                      <div className="productname">{item.flower}</div>
                      <p>📍 {item.location}</p>

                      <div className="productinfo">
                        <strong>
                          ₹{item.price}
                          <small> / {item.unit}</small>
                        </strong>
                        <span>{item.quantity} available</span>
                      </div>

                      <div className="farmer">Grown by {item.farmerName}</div>

                      <button
                        className="btn wide"
                        disabled={!item.quantity || user?.role === 'farmer'}
                        onClick={() => user && placeOrder(item)}
                      >
                        {user ? 'Place order' : 'Login to order'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {page === 'auth' && (
            <div className="authlayout">
              <div className="authvisual">
                <Flower2 size={54} />
                <h2>
                  Growing a fairer
                  <br />
                  flower economy.
                </h2>
                <p>From the gardens of Udupi to buyers everywhere.</p>
              </div>

              <div className="authbox">
                <span className="eyebrow green">WELCOME TO BLOOMBRIDGE</span>
                <h2>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
                <p>
                  {authMode === 'login'
                    ? 'Sign in to manage your flowers and orders.'
                    : 'Join as a farmer or buyer in minutes.'}
                </p>

                <form onSubmit={submitAuth}>
                  {authMode === 'register' && (
                    <>
                      <label>
                        Full name
                        <input name="name" placeholder="Your full name" required minLength="2" />
                      </label>

                      <label>
                        I am a
                        <select name="role">
                          <option value="farmer">Farmer / Grower</option>
                          <option value="buyer">Buyer / Trader</option>
                        </select>
                      </label>
                    </>
                  )}

                  <label>
                    Email address
                    <input name="email" type="email" placeholder="you@example.com" required />
                  </label>

                  <label>
                    Password
                    <input
                      name="password"
                      type="password"
                      minLength="8"
                      placeholder="Minimum 8 characters"
                      required
                    />
                  </label>

                  <button disabled={busy} className="btn wide">
                    {busy
                      ? 'Please wait...'
                      : authMode === 'login'
                        ? 'Sign in'
                        : 'Create account'}
                    <ArrowRight size={17} />
                  </button>
                </form>

                <p className="switch">
                  {authMode === 'login' ? 'New to BloomBridge?' : 'Already registered?'}
                  <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
                    {authMode === 'login' ? 'Create an account' : 'Sign in'}
                  </button>
                </p>
              </div>
            </div>
          )}

          {page === 'dashboard' && (
            <>
              <div className="pageheading">
                <span className="eyebrow green">YOUR WORKSPACE</span>
                <h1>
                  Good day, {user?.name || 'friend'} <span>✿</span>
                </h1>
                <p>Here&apos;s what&apos;s happening across your flower network.</p>
              </div>

              <div className="dashgrid">
                <div className="metric">
                  <Flower2 />
                  <span>Available listings</span>
                  <strong>{user?.role === 'farmer' ? items.filter((item) => item.farmerId === user.id).length : items.length}</strong>
                </div>

                <div className="metric">
                  <ShoppingBasket />
                  <span>Your orders</span>
                  <strong>{orders.length}</strong>
                </div>

                <div className="metric">
                  <IndianRupee />
                  <span>Order value</span>
                  <strong>₹{orders.reduce((sum, order) => sum + order.total, 0).toLocaleString('en-IN')}</strong>
                </div>
              </div>

              {user?.role === 'admin' && summary && (
                <div className="panel">
                  <h3>Platform overview</h3>
                  <p>
                    {summary.users} users · {summary.listings} listings · {summary.orders} orders
                  </p>
                </div>
              )}

              <div className="panel">
                <h3>{user?.role === 'farmer' ? 'Your flower listings' : 'Your next step'}</h3>

                {user?.role === 'farmer' ? (
                  <>
                    <p>Manage your harvest and track incoming orders.</p>
                    <button className="btn" onClick={() => setPage('new')}>
                      Add a listing <Plus size={17} />
                    </button>

                    <div className="miniitems">
                      {items
                        .filter((item) => item.farmerId === user.id)
                        .map((item) => (
                          <div key={item.id}>
                            <strong>{item.flower}</strong>
                            <span>
                              ₹{item.price}/{item.unit} · {item.quantity} available
                            </span>
                          </div>
                        ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p>Explore fresh flowers and connect with trusted local growers.</p>
                    <button className="btn" onClick={() => setPage('market')}>
                      Explore marketplace <ArrowRight size={17} />
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {page === 'new' && (
            <div className="formpage">
              <span className="eyebrow green">FARMER STUDIO</span>
              <h1>List your harvest</h1>
              <p>Reach buyers directly with clear prices and available quantities.</p>

              <form className="panel listingform" onSubmit={createListing}>
                <label>
                  Flower name
                  <input name="flower" placeholder="e.g. Udupi Mallige" required maxLength="80" />
                </label>

                <label>
                  Farm location
                  <input name="location" placeholder="e.g. Shankarapura, Udupi" required maxLength="100" />
                </label>

                <div className="formrow">
                  <label>
                    Price (₹)
                    <input name="price" type="number" min="0.01" step="0.01" required />
                  </label>

                  <label>
                    Available quantity
                    <input name="quantity" type="number" min="1" step="1" required />
                  </label>
                </div>

                <label>
                  Unit
                  <select name="unit">
                    <option value="atte">Atte (traditional unit)</option>
                    <option value="kg">Kilogram</option>
                    <option value="bundle">Bundle</option>
                  </select>
                </label>

                <button className="btn" disabled={busy}>
                  Publish listing <ArrowRight size={16} />
                </button>
              </form>
            </div>
          )}

          {page === 'orders' && (
            <>
              <div className="pageheading">
                <span className="eyebrow green">ORDER MANAGEMENT</span>
                <h1>My orders</h1>
                <p>Track purchase commitments and delivery progress.</p>
              </div>

              <div className="panel">
                <div className="orderlist">
                  {orders.length === 0 ? (
                    <div className="empty smallEmpty">
                      No orders yet. Browse the marketplace to get started.
                    </div>
                  ) : (
                    orders.map((order) => (
                      <div className="order" key={order.id}>
                        <div>
                          <strong>{order.flower}</strong>
                          <p>
                            {order.quantity} {order.unit} · ₹{order.total} ·{' '}
                            {user?.role === 'farmer'
                              ? 'Buyer: ' + order.buyerName
                              : 'Grower: ' + order.farmerName}
                          </p>
                          <small>{new Date(order.createdAt).toLocaleString()}</small>
                        </div>

                        <div className="orderactions">
                          <span className={'status ' + order.status}>{order.status}</span>

                          {user?.role === 'farmer' && order.status === 'pending' && (
                            <>
                              <button onClick={() => updateOrder(order.id, 'confirmed')}>Confirm</button>
                              <button onClick={() => updateOrder(order.id, 'rejected')}>Reject</button>
                            </>
                          )}

                          {user?.role === 'farmer' && order.status === 'confirmed' && (
                            <button onClick={() => updateOrder(order.id, 'completed')}>
                              Mark completed
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          <footer>
            © {new Date().getFullYear()} BloomBridge · Rooted in Udupi, built for growers.{' '}
            <span>Fair prices. Fresh possibilities.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
