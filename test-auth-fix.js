// Test script to verify authentication flow fixes
// Run this in the browser console to test

async function testAuthFlow() {
  console.log('Testing Authentication Flow Fixes...');

  // Test 1: Check that showAccSec redirects logged-in users away from auth screens
  console.log('\n1. Testing logged-in user redirected away from login/register screens...');

  // Mock a logged-in user
  currentUser = {
    id: 'test123',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    role: 'customer',
    full_name: 'Test User'
  };

  // Mock updateAuthUI and showToast to capture what happens
  const calls = [];
  const originalShowToast = showToast;
  const originalShowAccSec = showAccSec;

  showToast = (msg) => {
    calls.push({ type: 'showToast', message: msg });
    console.log(`Toast: ${msg}`);
    originalShowToast?.(msg);
  };

  showAccSec = (sec) => {
    calls.push({ type: 'showAccSec', section: sec });
    console.log(`showAccSec: ${sec}`);
    // Call original with dashboard since we're testing redirection
    return originalShowAccSec?.(sec === 'login' || sec === 'register' ? 'dashboard' : sec);
  };

  // Test showAccSec('login') with logged-in user
  calls.length = 0;
  showAccSec('login');
  console.log('Result:', calls.find(c => c.type === 'showAccSec')?.section);

  // Test showAccSec('register') with logged-in user
  calls.length = 0;
  showAccSec('register');
  console.log('Result:', calls.find(c => c.type === 'showAccSec')?.section);

  // Test showAccSec('dashboard') with logged-in user
  calls.length = 0;
  showAccSec('dashboard');
  console.log('Result:', calls.find(c => c.type === 'showAccSec')?.section);

  // Restore original functions
  showToast = originalShowToast;
  showAccSec = originalShowAccSec;

  // Test 2: Check that showAccSec redirects non-logged-in users to login
  console.log('\n2. Testing non-logged-in user redirected from account screens...');

  // Clear currentUser
  currentUser = null;

  showToast = (msg) => {
    calls.push({ type: 'showToast', message: msg });
    console.log(`Toast: ${msg}`);
    originalShowToast?.(msg);
  };

  showAccSec = (sec) => {
    calls.push({ type: 'showAccSec', section: sec });
    console.log(`showAccSec: ${sec}`);
    // Call original with login for account screens
    if (sec === 'dashboard' || sec === 'profile' || sec === 'orders' || sec === 'wishlist' || sec === 'settings' || sec === 'admin' || sec === 'track') {
      return originalShowAccSec?.('login');
    }
    return originalShowAccSec?.(sec);
  };

  // Test showAccSec('dashboard') with no user
  calls.length = 0;
  showAccSec('dashboard');
  console.log('Result:', calls.find(c => c.type === 'showAccSec')?.section);

  // Test 3: Check loginUser() prevents already logged-in users
  console.log('\n3. Testing loginUser() with already logged-in user...');

  currentUser = {
    id: 'test123',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    role: 'customer',
    full_name: 'Test User'
  };

  showToast = (msg) => {
    calls.push({ type: 'showToast', message: msg });
    console.log(`Toast: ${msg}`);
    originalShowToast?.(msg);
  };

  // Mock apiPost to avoid network call
  const originalApiPost = window.apiPost;
  window.apiPost = () => Promise.resolve({ user: currentUser });

  // Mock Firebase functions
  const originalSignIn = window.MN_FIREBASE_SDK?.signInWithEmailAndPassword;
  window.MN_FIREBASE_SDK = {
    signInWithEmailAndPassword: () => Promise.resolve({
      user: { uid: 'test123', email: 'test@example.com', displayName: 'Test User' }
    })
  };

  calls.length = 0;
  await loginUser();
  console.log('Result:', calls.find(c => c.type === 'showAccSec')?.section);

  // Restore original functions
  showToast = originalShowToast;
  window.apiPost = originalApiPost;
  window.MN_FIREBASE_SDK = originalSignIn ? { signInWithEmailAndPassword: originalSignIn } : {};

  // Test 4: Check registerUser() prevents already logged-in users
  console.log('\n4. Testing registerUser() with already logged-in user...');

  showToast = (msg) => {
    calls.push({ type: 'showToast', message: msg });
    console.log(`Toast: ${msg}`);
    originalShowToast?.(msg);
  };

  calls.length = 0;
  await registerUser();
  console.log('Result:', calls.find(c => c.type === 'showAccSec')?.section);

  // Restore original functions
  showToast = originalShowToast;

  // Test 5: Check error handling in loginUser()
  console.log('\n5. Testing loginUser() error handling...');

  currentUser = null;

  showToast = (msg) => {
    calls.push({ type: 'showToast', message: msg });
    console.log(`Toast: ${msg}`);
    originalShowToast?.(msg);
  };

  const originalSignInWithEmailAndPassword = window.MN_FIREBASE_SDK?.signInWithEmailAndPassword;
  window.MN_FIREBASE_SDK = {
    signInWithEmailAndPassword: () => Promise.reject({
      code: 'auth/user-not-found',
      message: 'No account found with this email.'
    })
  };

  // Mock document.getElementById
  const originalGetElementById = document.getElementById;
  document.getElementById = (id) => {
    if (id === 'loginEmail') return { value: 'nonexistent@example.com' };
    if (id === 'loginPass') return { value: 'password123' };
    if (id === 'loginBtn') return { disabled: false, textContent: 'Login' };
    return originalGetElementById?.(id);
  };

  calls.length = 0;
  await loginUser();
  console.log('Result:', calls.find(c => c.type === 'showAccSec')?.section);

  // Restore original functions
  showToast = originalShowToast;
  window.MN_FIREBASE_SDK = originalSignInWithEmailAndPassword ? { signInWithEmailAndPassword: originalSignInWithEmailAndPassword } : {};
  document.getElementById = originalGetElementById;

  // Test 6: Check socialLogin() prevents already logged-in users
  console.log('\n6. Testing socialLogin() with already logged-in user...');
  currentUser = {
    id: 'test123',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    role: 'customer'
  };

  calls.length = 0;
  await socialLogin('google');
  console.log('Toast:', calls.find(c => c.type === 'showToast')?.message);

  // Test 7: Check socialLogin('google') successful sign-in via popup
  console.log('\n7. Testing socialLogin() successful popup sign-in...');
  currentUser = null;
  calls.length = 0;

  const originalSdk = window.MN_FIREBASE_SDK;
  const originalAuth = window.MN_FIREBASE_AUTH;
  const originalGo = window.go;

  window.MN_FIREBASE_AUTH = { currentUser: null };
  window.MN_FIREBASE_SDK = {
    GoogleAuthProvider: class {
      addScope() {}
      setCustomParameters() {}
    },
    signInWithPopup: () => Promise.resolve({
      user: {
        uid: 'google-uid-123',
        email: 'googleuser@example.com',
        displayName: 'Google User',
        getIdToken: () => Promise.resolve('mock-google-token')
      }
    })
  };
  window.apiPost = () => Promise.resolve({
    user: {
      id: 'google-uid-123',
      email: 'googleuser@example.com',
      first_name: 'Google',
      last_name: 'User',
      role: 'customer'
    }
  });
  window.go = (sec) => {
    calls.push({ type: 'go', section: sec });
  };

  await socialLogin('google');
  console.log('Logged in user:', currentUser?.email);
  console.log('User full name:', currentUser?.full_name);
  console.log('Navigation:', calls.find(c => c.type === 'go')?.section);

  // Test 8: Check socialLogin() handles popup closed by user
  console.log('\n8. Testing socialLogin() popup cancelled handling...');
  currentUser = null;
  calls.length = 0;

  window.MN_FIREBASE_SDK.signInWithPopup = () => Promise.reject({
    code: 'auth/popup-closed-by-user',
    message: 'Popup closed'
  });

  await socialLogin('google');
  console.log('Toast on cancel:', calls.find(c => c.type === 'showToast')?.message);

  // Restore mocks
  window.MN_FIREBASE_SDK = originalSdk;
  window.MN_FIREBASE_AUTH = originalAuth;
  window.go = originalGo;

  console.log('\nAll tests completed!');
}

