import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp, ArrowRight, BadgeCheck, BookOpen, Check, ChevronDown, CircleHelp,
  Compass, Copy, Heart, ImagePlus, Laptop, Leaf, LockKeyhole, LogOut, Mail, Menu, Plus,
  Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Tag, Trash2,
  UserRound, X, Pencil
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const categories = ['All items', 'Books', 'Electronics', 'Hostel essentials', 'Clothing', 'Other'];
const tokenKey = 'cx_token';

function App() {
  const [token, setToken] = useState(localStorage.getItem(tokenKey) || '');
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cx_user') || 'null'); } catch { return null; }
  });
  const [tab, setTab] = useState('marketplace');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All items');
  const [type, setType] = useState('All');
  const [posts, setPosts] = useState([]);
  const [mine, setMine] = useState([]);
  const [modal, setModal] = useState('');
  const [detailPost, setDetailPost] = useState(null);
  const [contactInfo, setContactInfo] = useState(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const isMine = tab === 'my-posts';
  const shownPosts = useMemo(() => isMine ? mine : posts, [isMine, mine, posts]);

  async function api(path, options = {}) {
    const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers };
    const response = await fetch(`${API}/api${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed. Please try again.');
    return data;
  }

  async function loadPosts() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!isMine) params.set('module', tab);
      if (query.trim()) params.set('search', query.trim());
      if (category !== 'All items') params.set('category', category);
      if (type !== 'All') params.set('type', type.toLowerCase());
      const data = await api(isMine ? '/posts/mine' : `/posts?${params}`);
      if (isMine) setMine(data.posts); else setPosts(data.posts);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadPosts(); }, [tab, category, type, token]);
  useEffect(() => {
    if (!detailPost || !token) {
      setContactInfo(null);
      setContactError('');
      setContactLoading(false);
      return;
    }
    let active = true;
    setContactLoading(true);
    setContactError('');
    api(`/posts/${detailPost.id}/contact`)
      .then((data) => { if (active) setContactInfo(data); })
      .catch((err) => { if (active) setContactError(err.message); })
      .finally(() => { if (active) setContactLoading(false); });
    return () => { active = false; };
  }, [detailPost?.id, token]);
  useEffect(() => {
    const timer = setTimeout(() => loadPosts(), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const verificationToken = currentUrl.searchParams.get('token');
    if (verificationToken) {
      api('/auth/verify', { method: 'POST', body: JSON.stringify({ token: verificationToken }) })
        .then((data) => {
          setNotice(data.message);
          currentUrl.searchParams.delete('token');
          window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
        })
        .catch((err) => setError(err.message));
    }
  }, []);

  function signOut() {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem('cx_user');
    setToken('');
    setUser(null);
    setTab('marketplace');
    setDetailPost(null);
    setNotice('You have signed out.');
  }

  async function updateStatus(post, status) {
    try {
      await api(`/posts/${post.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(status === 'active' ? 'Post is active again.' : 'Post marked as complete.');
      loadPosts();
    } catch (err) { setError(err.message); }
  }

  async function deletePost(post) {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    try { await api(`/posts/${post.id}`, { method: 'DELETE' }); setNotice('Post deleted.'); loadPosts(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={() => setTab('marketplace')} aria-label="CampusXchange home">
          <span className="brand-mark"><ArrowDownUp size={19} strokeWidth={2.6} /></span>
          <span>campus<span className="brand-light">xchange</span></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={tab === 'marketplace' ? 'nav-item active' : 'nav-item'} onClick={() => { setTab('marketplace'); setType('All'); }}>Marketplace</button>
          <button className={tab === 'lost_found' ? 'nav-item active' : 'nav-item'} onClick={() => { setTab('lost_found'); setType('All'); }}>Lost &amp; Found</button>
        </nav>
        <div className="top-actions">
          <span className="campus-chip"><span className="status-dot" /> NIT Warangal</span>
          {user ? <>
            <button className="profile-button" onClick={() => setTab('my-posts')} title="My posts"><span className="avatar">{user.name?.[0]?.toUpperCase()}</span><span className="profile-name">{user.name?.split(' ')[0]}</span></button>
            <button className="icon-button signout" onClick={signOut} title="Sign out"><LogOut size={17} /></button>
          </> : <button className="button button-dark top-signin" onClick={() => setModal('auth')}>Sign in <ArrowRight size={15} /></button>}
        </div>
      </header>

      <main>
        {tab !== 'my-posts' && <section className={`hero ${tab === 'lost_found' ? 'hero-lost' : ''}`}>
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-icon"><Sparkles size={13} /></span> MADE FOR NITW</div>
            <h1>{tab === 'marketplace' ? <>Good finds.<br /><span>Good for campus.</span></> : <>Lost something?<br /><span>Let’s find it.</span></>}</h1>
            <p>{tab === 'marketplace' ? 'Give your things a second life, or find something you need — right here on campus.' : 'A shared place for lost and found items. Your next clue could be right here.'}</p>
            <div className="hero-buttons">
              <button className="button button-dark" onClick={() => user ? setModal('post') : setModal('auth')}>
                <Plus size={17} /> {tab === 'marketplace' ? 'Create a listing' : 'Post an item'}
              </button>
              <a className="text-link" href="#discover">Explore posts <ArrowRight size={15} /></a>
            </div>
            <div className="hero-proof"><span className="proof-icon"><ShieldCheck size={15} /></span> Student-only community <span className="proof-separator">·</span> Verified NITW email</div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
            <div className="art-card art-book"><BookOpen size={25} /><span>Good as new</span></div>
            <div className="art-card art-laptop"><Laptop size={25} /><span>Find your next thing</span></div>
            <div className="art-center"><ArrowDownUp size={32} /></div>
            <div className="art-note"><Leaf size={14} /> Reuse. Relove.</div>
            <div className="art-sparkle spark-one">✳</div><div className="art-sparkle spark-two">✦</div>
          </div>
        </section>}

        <section className="content-section" id="discover">
          <div className="section-heading">
            <div>
              <div className="section-kicker">{isMine ? 'YOUR CAMPUS ACTIVITY' : tab === 'marketplace' ? 'THE CAMPUS MARKETPLACE' : 'THE COMMUNITY BOARD'}</div>
              <h2>{isMine ? 'My posts' : tab === 'marketplace' ? 'Find your next good thing' : 'Recent reports'}</h2>
              <p>{isMine ? 'Keep track of your listings and reports.' : tab === 'marketplace' ? 'Thoughtful finds from people just around the corner.' : 'See what’s been lost, found, and reunited on campus.'}</p>
            </div>
            <button className="button button-outline create-desktop" onClick={() => user ? setModal('post') : setModal('auth')}><Plus size={17} /> Create a post</button>
          </div>

          <div className="filter-bar">
            <label className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items, places, keywords..." /><kbd>/</kbd></label>
            <div className="filter-select"><SlidersHorizontal size={16} /><select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></div>
            {tab === 'marketplace' && <div className="type-tabs">{['All', 'Sell', 'Exchange', 'Free'].map((item) => <button key={item} className={type === item ? 'type-tab selected' : 'type-tab'} onClick={() => setType(item)}>{item}</button>)}</div>}
            {tab === 'lost_found' && <div className="type-tabs">{['All', 'Lost', 'Found'].map((item) => <button key={item} className={type === item ? 'type-tab selected' : 'type-tab'} onClick={() => setType(item)}>{item}</button>)}</div>}
          </div>

          {notice && <div className="notice"><Check size={16} /> {notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
          {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={15} /></button></div>}

          {loading ? <div className="loading-state"><span className="spinner" /> Loading campus posts...</div> : shownPosts.length ? <div className="post-grid">
            {shownPosts.map((post) => <PostCard key={post.id} post={post} own={isMine} onOpen={setDetailPost} onStatus={updateStatus} onDelete={deletePost} onEdit={(item) => setModal({ kind: 'edit', post: item })} />)}
          </div> : <div className="empty-state">
            <div className="empty-icon">{isMine ? <UserRound /> : tab === 'marketplace' ? <ShoppingBag /> : <Compass />}</div>
            <h3>{isMine ? 'Your posts will show up here' : 'Nothing here just yet'}</h3>
            <p>{isMine ? 'Create your first listing or report to get started.' : 'Try a different search, or be the first to post something.'}</p>
            <button className="button button-dark" onClick={() => user ? setModal('post') : setModal('auth')}><Plus size={16} /> Create a post</button>
          </div>}
        </section>

        <section className="trust-strip">
          <div className="trust-item"><div className="trust-icon mint"><BadgeCheck size={20} /></div><div><strong>NITW students only</strong><span>Sign up with your student email</span></div></div>
          <div className="trust-item"><div className="trust-icon peach"><Heart size={19} /></div><div><strong>Keep it on campus</strong><span>Connect with your community</span></div></div>
          <div className="trust-item"><div className="trust-icon lilac"><Leaf size={19} /></div><div><strong>Give things a second life</strong><span>Less waste, more good finds</span></div></div>
          <div className="trust-note"><LockKeyhole size={15} /> Built for the NITW community</div>
        </section>
      </main>
      <footer><a className="brand footer-brand" href="#"><span className="brand-mark"><ArrowDownUp size={16} /></span><span>campus<span className="brand-light">xchange</span></span></a><span>Made for campus life at NIT Warangal</span><a href="mailto:campusxchange@example.com"><CircleHelp size={15} /> Need help?</a></footer>

      {detailPost && <PostDetailModal post={detailPost} contactInfo={contactInfo} loading={contactLoading} error={contactError} signedIn={Boolean(user)} onClose={() => setDetailPost(null)} onSignIn={() => setModal('auth')} onCopy={async (email) => {
        try { await navigator.clipboard.writeText(email); setNotice('Contact email copied.'); }
        catch { setError('Could not copy the email. You can select and copy it manually.'); }
      }} />}
      {modal === 'auth' && <AuthModal onClose={() => setModal('')} api={api} onSuccess={(data) => {
        localStorage.setItem(tokenKey, data.token); localStorage.setItem('cx_user', JSON.stringify(data.user)); setToken(data.token); setUser(data.user); setModal(''); setNotice(`Welcome to CampusXchange, ${data.user.name.split(' ')[0]}!`);
      }} />}
      {(modal === 'post' || modal?.kind === 'edit') && <PostModal module={modal?.post?.module || (tab === 'lost_found' ? 'lost_found' : 'marketplace')} post={modal?.post} api={api} onClose={() => setModal('')} onSaved={(edited) => { setModal(''); setTab('my-posts'); setNotice(edited ? 'Your post has been updated.' : 'Your post is live.'); }} onError={setError} />}
    </div>
  );
}

function PostCard({ post, own, onOpen, onStatus, onDelete, onEdit }) {
  const lostFound = post.module === 'lost_found';
  const typeLabel = post.type === 'sell' ? 'FOR SALE' : post.type === 'exchange' ? 'FOR EXCHANGE' : post.type === 'free' ? 'GIVING AWAY' : post.type === 'lost' ? 'LOST' : 'FOUND';
  return <article className="post-card" role="button" tabIndex={0} aria-label={`View details for ${post.title}`} onClick={() => onOpen(post)} onKeyDown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(post); }
  }}>
    <div className="post-image">
      {post.imageUrl ? <img src={post.imageUrl} alt={post.title} /> : <div className={`image-placeholder ${lostFound ? 'placeholder-lost' : ''}`}><span>{lostFound ? <Compass size={27} /> : post.category === 'Books' ? <BookOpen size={27} /> : post.category === 'Electronics' ? <Laptop size={27} /> : <ShoppingBag size={27} />}</span><small>{lostFound ? 'CAMPUS LOST & FOUND' : 'CAMPUS FINDS'}</small></div>}
      <span className={`post-badge ${lostFound ? 'badge-lost' : post.type === 'free' ? 'badge-free' : ''}`}>{typeLabel}</span>
      {own && <span className={`status-badge ${post.status !== 'active' ? 'status-complete' : ''}`}>{post.status === 'active' ? 'ACTIVE' : post.status.toUpperCase()}</span>}
    </div>
    <div className="post-info">
      <div className="post-title-row"><h3>{post.title}</h3>{post.price != null && <span className="price">₹{Number(post.price).toLocaleString('en-IN')}</span>}</div>
      <p className="post-description">{post.description}</p>
      <div className="post-meta"><span><Tag size={13} /> {post.category}</span>{post.itemCondition && <><i>·</i><span>{post.itemCondition}</span></>}{post.location && <><i>·</i><span>{post.location}</span></>}</div>
      <div className="post-footer"><div className="seller"><span className="seller-avatar">{(post.sellerName || 'N')[0].toUpperCase()}</span><span>{own ? 'You' : post.sellerName || 'NITW student'}</span><BadgeCheck size={14} /></div>
        {own ? <div className="owner-actions" onClick={(event) => event.stopPropagation()}><button title="Edit post" onClick={() => onEdit(post)}><Pencil size={14} /></button>{post.status === 'active' && <button onClick={() => onStatus(post, lostFound ? 'resolved' : 'sold')}>{lostFound ? 'Mark resolved' : 'Mark sold'}</button>}{post.status !== 'active' && <button onClick={() => onStatus(post, 'active')}>Reopen</button>}<button title="Delete post" onClick={() => onDelete(post)}><Trash2 size={14} /></button></div> : <span className="post-date">{new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
      </div>
    </div>
  </article>;
}

function PostDetailModal({ post, contactInfo, loading, error, signedIn, onClose, onSignIn, onCopy }) {
  const lostFound = post.module === 'lost_found';
  const typeLabel = post.type === 'sell' ? 'FOR SALE' : post.type === 'exchange' ? 'FOR EXCHANGE' : post.type === 'free' ? 'GIVING AWAY' : post.type === 'lost' ? 'LOST' : 'FOUND';
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
      {post.imageUrl
        ? <img className="detail-image" src={post.imageUrl} alt={post.title} />
        : <div className={`detail-image detail-image-placeholder ${lostFound ? 'placeholder-lost' : ''}`}><ShoppingBag size={34} /></div>}
      <div className="detail-labels"><span className={`post-badge ${lostFound ? 'badge-lost' : post.type === 'free' ? 'badge-free' : ''}`}>{typeLabel}</span><span className="detail-category">{post.category}</span></div>
      <div className="detail-title-row"><h2 id="detail-title">{post.title}</h2>{post.price != null && <span className="price">₹{Number(post.price).toLocaleString('en-IN')}</span>}</div>
      <p className="detail-description">{post.description}</p>
      <div className="detail-facts">
        {post.itemCondition && <div><span>Condition</span><strong>{post.itemCondition}</strong></div>}
        {post.location && <div><span>{lostFound ? 'Location' : 'Pickup'}</span><strong>{post.location}</strong></div>}
        <div><span>Posted</span><strong>{new Date(post.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</strong></div>
        <div><span>Posted by</span><strong>{contactInfo?.isOwner ? 'You' : post.sellerName || 'NITW student'}</strong></div>
      </div>
      <div className="contact-panel">
        <div className="contact-heading"><Mail size={17} /><div><strong>Contact about this post</strong><span>Arrange a safe meetup on campus.</span></div></div>
        {!signedIn ? <button className="button button-dark contact-button" onClick={onSignIn}>Sign in to contact the poster <ArrowRight size={15} /></button>
          : loading ? <div className="contact-state">Loading contact details...</div>
            : error ? <div className="contact-state contact-error">{error}</div>
              : contactInfo?.isOwner ? <div className="contact-state">This is your post.</div>
                : contactInfo?.contactEmail ? <div className="contact-actions"><a className="button button-dark" href={`mailto:${contactInfo.contactEmail}?subject=${encodeURIComponent(`CampusXchange: ${post.title}`)}`}><Mail size={15} /> Email poster</a><button className="button button-outline" onClick={() => onCopy(contactInfo.contactEmail)}><Copy size={15} /> Copy email</button></div>
                  : <div className="contact-state">Contact details are unavailable.</div>}
      </div>
      <p className="detail-safety"><ShieldCheck size={14} /> For safety, meet in a public place on campus.</p>
    </section>
  </div>;
}

function AuthModal({ onClose, api, onSuccess }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const data = await api(`/auth/${mode === 'signup' ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(form) });
      if (mode === 'signup') setMessage(data.message); else onSuccess(data);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
      <span className="modal-logo"><ArrowDownUp size={20} /></span><div className="section-kicker">WELCOME TO CAMPUSXCHANGE</div>
      <h2 id="auth-title">{mode === 'login' ? 'Good to see you again.' : 'Join your campus community.'}</h2>
      <p className="modal-subtitle">{mode === 'login' ? 'Sign in with your verified NITW student email.' : 'A place for NITW students to find, share, and reconnect.'}</p>
      <div className="auth-switch"><button className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setMessage(''); setError(''); }}>Sign in</button><button className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setMessage(''); setError(''); }}>Create account</button></div>
      {message && <div className="notice auth-message"><Check size={16} /> {message}</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      {!message && <form onSubmit={submit} className="form-stack">
        {mode === 'signup' && <label>Your name<input autoComplete="name" required minLength="2" maxLength="100" placeholder="e.g. Ananya Rao" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>}
        <label>NITW student email<input autoComplete="email" type="email" required placeholder="name@student.nitw.ac.in" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Password<input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type="password" minLength="8" required placeholder="At least 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {mode === 'signup' && <div className="domain-hint"><ShieldCheck size={15} /> Verification link will be sent to your student inbox.</div>}
        <button className="button button-dark submit-button" disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create my account'} <ArrowRight size={16} /></button>
      </form>}
      <div className="modal-footnote"><LockKeyhole size={13} /> Your student email stays private.</div>
    </section>
  </div>;
}

function PostModal({ module, post, api, onClose, onSaved, onError }) {
  const [form, setForm] = useState(post ? {
    type: post.type, title: post.title, description: post.description, category: post.category,
    itemCondition: post.itemCondition || 'Good', price: post.price ?? '', location: post.location || '', imageUrl: post.imageUrl || ''
  } : { type: module === 'marketplace' ? 'sell' : 'lost', title: '', description: '', category: 'Books', itemCondition: 'Good', price: '', location: '', imageUrl: '' });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const isMarketplace = module === 'marketplace';
  async function uploadImage(file) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData(); body.append('image', file);
      const data = await api('/images', { method: 'POST', body });
      setForm((current) => ({ ...current, imageUrl: data.imageUrl }));
    } catch (err) { onError(err.message); } finally { setUploading(false); }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    try { await api(post ? `/posts/${post.id}` : '/posts', { method: post ? 'PATCH' : 'POST', body: JSON.stringify({ ...form, module }) }); onSaved(Boolean(post)); }
    catch (err) { onError(err.message); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="modal post-modal" role="dialog" aria-modal="true" aria-labelledby="post-title">
      <button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
      <div className="section-kicker">{isMarketplace ? 'THE CAMPUS MARKETPLACE' : 'THE COMMUNITY BOARD'}</div>
      <h2 id="post-title">{post ? 'Edit your post' : isMarketplace ? 'Create a listing' : 'Post a lost or found item'}</h2>
      <p className="modal-subtitle">A few details help the right person find your post.</p>
      <form className="form-stack post-form" onSubmit={submit}>
        <label>{isMarketplace ? 'What would you like to do?' : 'Is it lost or found?'}<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{isMarketplace ? <><option value="sell">Sell an item</option><option value="exchange">Exchange an item</option><option value="free">Give it away for free</option></> : <><option value="lost">I lost something</option><option value="found">I found something</option></>}</select></label>
        <label>Item name<input required minLength="3" maxLength="120" placeholder={isMarketplace ? 'e.g. Engineering Mathematics textbook' : 'e.g. Black water bottle'} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <div className="form-row"><label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label>
          {isMarketplace ? <label>Condition<select value={form.itemCondition} onChange={(e) => setForm({ ...form, itemCondition: e.target.value })}>{['Like new', 'Good', 'Fair'].map((item) => <option key={item}>{item}</option>)}</select></label> : <label>{form.type === 'lost' ? 'Last seen near' : 'Found near'}<input maxLength="160" placeholder="e.g. Library, Block 2" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>}
        </div>
        {isMarketplace && form.type === 'sell' && <label>Price (₹)<input type="number" min="0" step="1" required placeholder="e.g. 500" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>}
        <label>Description<textarea required minLength="5" maxLength="4000" rows="3" placeholder="Add the details someone would want to know..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        {isMarketplace && <label>Pickup location <span className="optional">(optional)</span><input maxLength="160" placeholder="e.g. Near the main gate" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>}
        <div className="photo-upload">{form.imageUrl ? <div className="photo-preview"><img src={form.imageUrl} alt="Uploaded item" /><button type="button" onClick={() => setForm({ ...form, imageUrl: '' })}><X size={14} /> Remove</button></div> : <label className="upload-drop"><ImagePlus size={19} /><span>{uploading ? 'Uploading photo...' : 'Add a photo'}</span><small>JPG, PNG or WebP · up to 5 MB</small><input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => uploadImage(e.target.files?.[0])} /></label>}</div>
        <button className="button button-dark submit-button" disabled={busy || uploading}>{busy ? post ? 'Saving...' : 'Publishing...' : post ? 'Save changes' : 'Publish post'} <ArrowRight size={16} /></button>
      </form>
    </section>
  </div>;
}

export default App;
