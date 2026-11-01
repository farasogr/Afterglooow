const $ = id => document.getElementById(id);
let auth, currentUser, mode = 'signup', snapshot, recovery = false, galleryRun = 0, guest = false;
const imageUrls = new Set();
const authMessage = message => $('auth-message').textContent = message;
function setMode(next) {
  mode = next;
  $('auth-title').textContent = next === 'signup' ? 'Create your account' : 'Welcome back';
  $('auth-submit').textContent = next === 'signup' ? 'Create account' : 'Sign in';
  $('toggle-auth').textContent = next === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account';
  $('password').autocomplete = next === 'signup' ? 'new-password' : 'current-password';
  $('password').minLength = next === 'signup' ? 8 : 1;
  $('password-help').hidden = next !== 'signup';
  $('forgot-password').hidden = next !== 'login';
  authMessage('');
}
function revokeImages() { for (const url of imageUrls) URL.revokeObjectURL(url); imageUrls.clear(); }
function signedOut() {
  guest = false;
  currentUser = null;
  snapshot = null;
  $('save-preview').removeAttribute('src');
  $('account-name').textContent = '';
  $('sign-out').textContent = 'Sign out';
  galleryRun++;
  revokeImages();
  $('gallery-grid').replaceChildren();
  $('stop').click();
  $('clear').click();
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  $('gallery-screen').hidden = true;
  $('auth-screen').hidden = false;
  $('password').value = '';
  history.replaceState(null, '', '/');
}
async function enter(user) {
  if (!user) return;
  guest = false;
  currentUser = user;
  $('sign-out').textContent = 'Sign out';
  $('password').value = '';
  $('account-name').textContent = user.email || 'Your account';
  $('auth-screen').hidden = true;
  if (location.pathname === '/creations') await showGallery();
  else if (!$('welcome').open) openWelcome(null);
}
function requestAccount(message) {
  $('stop').click();
  if ($('welcome').open) $('welcome').close();
  $('auth-screen').hidden = false;
  setMode('signup');
  authMessage(message);
  $('continue-guest').focus();
}
$('continue-guest').onclick = () => {
  if (recovery) return;
  guest = true;
  currentUser = null;
  $('password').value = '';
  $('account-name').textContent = 'Guest · Sign in to save your creations';
  $('sign-out').textContent = 'Sign up / Sign in';
  $('auth-screen').hidden = true;
  $('gallery-screen').hidden = true;
  history.replaceState(null, '', '/');
  if (!$('welcome').open) openWelcome(null);
};
$('toggle-auth').onclick = () => setMode(mode === 'signup' ? 'login' : 'signup');
$('email-form').onsubmit = async event => {
  event.preventDefault();
  if (!auth) return authMessage('Account connection is unavailable. Refresh to try again.');
  $('auth-submit').disabled = true;
  authMessage(recovery ? 'Updating password…' : mode === 'signup' ? 'Creating your account…' : 'Signing in…');
  try {
    if (recovery) {
      const user = await auth.updateUser({ password: $('password').value });
      recovery = false;
      location.reload();
      return;
    }
    const email = $('email').value.trim(), password = $('password').value;
    const user = mode === 'signup' ? await auth.signup(email, password) : await auth.login(email, password);
    if (mode === 'signup' && !user.emailVerified) authMessage('Check your email and follow the confirmation link to finish creating your account.');
    else await enter(user);
  } catch (error) { authMessage(error.message || 'Could not sign in. Please try again.'); }
  finally { $('auth-submit').disabled = false; }
};
for (const button of document.querySelectorAll('[data-provider]')) button.onclick = async () => {
  if (!auth) return authMessage('Account connection is unavailable. Refresh to try again.');
  button.disabled = true;
  try {
    const settings = await auth.getSettings();
    if (!settings.providers[button.dataset.provider]) {
      authMessage(`${button.dataset.provider === 'google' ? 'Google' : 'GitHub'} sign-in is not enabled for this site. Use email or continue as guest.`);
      return;
    }
    authMessage('Opening secure sign-in…');
    auth.oauthLogin(button.dataset.provider);
  } catch (error) {
    // The Identity SDK throws after starting navigation; this is not a login failure.
    if (error.message === 'Redirecting to OAuth provider') return;
    authMessage(error.message || 'Could not connect to this provider. Please try again.');
  }
  finally { button.disabled = false; }
};
$('forgot-password').onclick = async () => {
  if (!auth || !$('email').reportValidity()) return;
  $('forgot-password').disabled = true;
  try { await auth.requestPasswordRecovery($('email').value.trim()); authMessage('Check your email for a password reset link.'); }
  catch (error) { authMessage(error.message || 'Could not send the reset email.'); }
  finally { $('forgot-password').disabled = false; }
};
$('sign-out').onclick = async () => {
  if (guest) return requestAccount('Create an account or sign in to save your paintings.');
  $('sign-out').disabled = true;
  try { await auth.logout(); signedOut(); authMessage('You have signed out.'); }
  catch { $('save-status').textContent = 'Could not sign out. Please try again.'; }
  finally { $('sign-out').disabled = false; }
};
async function api(url = '/api/creations', options = {}) {
  await auth.getUser(); // Refresh the session cookie before requesting private data.
  const response = await fetch(url, { ...options, credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) { signedOut(); authMessage('Your session has expired. Please sign in again.'); throw new Error('Please sign in again.'); }
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Could not load your creations.'); }
  return response;
}
$('save-creation').onclick = async () => {
  if (!currentUser) return requestAccount('Create an account or sign in to save your painting. You can also keep painting as a guest.');
  $('save-creation').disabled = true;
  $('save-status').textContent = 'Capturing your painting…';
  try {
    snapshot = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { window.afterglowCapture = null; reject(new Error('Painting is unavailable. Please try again.')); }, 4000);
      window.afterglowCapture = { resolve: image => { clearTimeout(timer); resolve(image); }, reject: error => { clearTimeout(timer); reject(error); } };
    });
    $('save-preview').src = snapshot;
    $('save-message').textContent = 'This snapshot keeps the trails exactly as they appear now.';
    $('save-dialog').showModal();
    $('creation-title').focus();
    $('creation-title').select();
    $('save-status').textContent = '';
  } catch (error) { $('save-status').textContent = error.message; }
  finally { $('save-creation').disabled = false; }
};
$('cancel-save').onclick = () => $('save-dialog').close();
$('save-form').onsubmit = async event => {
  event.preventDefault();
  if (!$('creation-title').value.trim()) { $('save-message').textContent = 'Please enter a title.'; return; }
  $('confirm-save').disabled = true;
  $('cancel-save').disabled = true;
  $('save-message').textContent = 'Saving your creation…';
  try {
    await api('/api/creations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: $('creation-title').value.trim(), image: snapshot }) });
    $('save-dialog').close();
    $('save-status').textContent = 'Saved. Find it in My creations.';
  } catch (error) { $('save-message').textContent = error.message; }
  finally { $('confirm-save').disabled = false; $('cancel-save').disabled = false; }
};
async function showGallery() {
  if (!currentUser) return requestAccount('Sign in to view your saved creations, or continue painting as a guest.');
  $('stop').click();
  $('gallery-screen').hidden = false;
  if ($('welcome').open) $('welcome').close();
  history.replaceState(null, '', '/creations');
  $('gallery-title').tabIndex = -1;
  $('gallery-title').focus();
  await loadGallery();
}
async function loadGallery() {
  const run = ++galleryRun;
  revokeImages();
  $('gallery-grid').replaceChildren();
  $('gallery-message').textContent = 'Loading your collection…';
  try {
    const records = await (await api()).json();
    if (run !== galleryRun) return;
    $('gallery-message').textContent = records.length ? `${records.length} saved creation${records.length === 1 ? '' : 's'} · Only visible to you` : '';
    if (!records.length) {
      const empty = document.createElement('div'); empty.className = 'empty';
      const title = document.createElement('h3'); title.textContent = 'Your first light study starts here.';
      const description = document.createElement('p'); description.textContent = 'Paint something you love, then choose Save creation to keep a snapshot here.';
      const button = document.createElement('button'); button.className = 'primary'; button.textContent = 'Start painting'; button.onclick = backToPainting;
      empty.append(title, description, button); $('gallery-grid').append(empty); return;
    }
    for (const record of records) {
      const card = document.createElement('article'); card.className = 'creation';
      const image = document.createElement('img'); image.alt = record.title; image.loading = 'lazy';
      image.src = `/api/creations?id=${encodeURIComponent(record.id)}`;
      image.onerror = () => { image.alt = 'Preview unavailable. Refresh to try again.'; };
      const info = document.createElement('div'); info.className = 'creation-info';
      const title = document.createElement('h3'); title.textContent = record.title;
      const date = document.createElement('time'); date.dateTime = record.createdAt; date.textContent = new Date(record.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      const actions = document.createElement('div'); actions.className = 'creation-actions';
      const download = document.createElement('button'); download.textContent = 'Download PNG';
      download.onclick = async () => {
        download.disabled = true;
        try {
          const response = await api(`/api/creations?id=${encodeURIComponent(record.id)}`);
          const url = URL.createObjectURL(await response.blob()); imageUrls.add(url);
          const link = document.createElement('a'); link.href = url; link.download = `${record.title.replace(/[^a-z0-9 _-]/gi, '').slice(0,80) || 'afterglow'}.png`; link.click();
        } catch (error) { $('gallery-message').textContent = error.message; }
        finally { download.disabled = false; }
      };
      const remove = document.createElement('button'); remove.textContent = 'Delete';
      let confirmTimer;
      remove.onclick = async () => {
        if (remove.dataset.confirm !== 'yes') {
          remove.dataset.confirm = 'yes'; remove.textContent = 'Confirm delete';
          confirmTimer = setTimeout(() => { remove.dataset.confirm = ''; remove.textContent = 'Delete'; }, 5000); return;
        }
        clearTimeout(confirmTimer); remove.disabled = true;
        try { await api(`/api/creations?id=${encodeURIComponent(record.id)}`, { method: 'DELETE' }); await loadGallery(); }
        catch (error) { $('gallery-message').textContent = error.message; remove.disabled = false; remove.dataset.confirm = ''; remove.textContent = 'Delete'; }
      };
      actions.append(download, remove); info.append(title, date, actions); card.append(image, info); $('gallery-grid').append(card);
    }
  } catch (error) { if (run === galleryRun) $('gallery-message').textContent = `${error.message} Use Refresh to try again.`; }
}
function backToPainting() { galleryRun++; revokeImages(); $('gallery-screen').hidden = true; history.replaceState(null, '', '/'); $('open-gallery').focus(); }
$('open-gallery').onclick = showGallery;
$('back-paint').onclick = backToPainting;
$('gallery-retry').onclick = loadGallery;
try {
  auth = await import('https://esm.sh/@netlify/identity@2.0.0?bundle');
  const callbackError = new URLSearchParams(location.hash.slice(1));
  if (callbackError.has('error') || callbackError.has('error_description')) {
    history.replaceState(null, '', location.pathname);
    authMessage('Social sign-in did not finish. Please try again, use email, or continue as guest.');
  }
  const callback = await auth.handleAuthCallback();
  if (callback?.type === 'recovery') {
    recovery = true;
    $('auth-title').textContent = 'Set a new password'; $('auth-description').textContent = 'Choose a new password for your account.';
    $('auth-submit').textContent = 'Update password'; $('email').required = false; $('email').closest('form').querySelector('label[for="email"]').hidden = true; $('email').hidden = true;
    document.querySelectorAll('[data-provider],.divider,#toggle-auth,#forgot-password,#continue-guest,#guest-help').forEach(element => element.hidden = true);
    authMessage('Enter a new password with at least 8 characters.');
  } else {
    const user = callback?.user || await auth.getUser();
    if (user) await enter(user); else if (!callbackError.has('error') && !callbackError.has('error_description')) authMessage('');
  }
  auth.onAuthChange((event, user) => {
    if (event === 'logout') signedOut();
    if (event === 'login' && !recovery) enter(user);
  });
} catch (error) { authMessage(error.message || 'Account connection failed. Refresh to try again.'); }
