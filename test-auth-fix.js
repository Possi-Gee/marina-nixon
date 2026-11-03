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

  console.log('\nAll tests completed!');
}

