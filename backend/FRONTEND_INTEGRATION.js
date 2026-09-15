// Frontend Integration Guide - Add this to your HTML file

// API Configuration
const API_URL = (window.MN_API_BASE || localStorage.getItem('mn_api_base') || (window.location.protocol === 'file:' ? 'http://localhost:5000/api' : '/api')).replace(/\/$/, '');
let authToken = localStorage.getItem('mn_token') || null;

// Helper function for API calls
async function apiCall(endpoint, method = 'GET', data = null, requireAuth = true) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (requireAuth && authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'API request failed');
    }

    return result;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Authentication Functions
async function register(firstName, lastName, email, password, phone) {
  try {
    const result = await apiCall('/auth/register', 'POST', {
      first_name: firstName,
      last_name: lastName,
      email,
      password,
      phone
    }, false);

    authToken = result.token;
    localStorage.setItem('mn_token', authToken);
    localStorage.setItem('mn_user', JSON.stringify(result.user));
    return result;
  } catch (error) {
    showToast('Registration failed: ' + error.message);
    throw error;
  }
}

async function login(email, password) {
  try {
    const result = await apiCall('/auth/login', 'POST', {
      email,
      password
    }, false);

    authToken = result.token;
    localStorage.setItem('mn_token', authToken);
    localStorage.setItem('mn_user', JSON.stringify(result.user));
    return result;
  } catch (error) {
    showToast('Login failed: ' + error.message);
    throw error;
  }
}

function logout() {
  authToken = null;
  localStorage.removeItem('mn_token');
  localStorage.removeItem('mn_user');
  showToast('Logged out successfully');
  go('home');
}

// Product Functions
async function fetchProducts(category = 'all', sort = 'default') {
  try {
    let endpoint = '/products';
    const params = [];
    
    if (category && category !== 'all') params.push(`category=${category}`);
    if (sort && sort !== 'default') params.push(`sort=${sort}`);
    
    if (params.length) endpoint += '?' + params.join('&');

    const products = await apiCall(endpoint, 'GET', null, false);
    return products;
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

async function searchProducts(query) {
  try {
    return await apiCall(`/products/search/${query}`, 'GET', null, false);
  } catch (error) {
    console.error('Error searching products:', error);
    return [];
  }
}

// Order Functions
async function createOrder(items, total, shippingCost, discount, paymentMethod, deliveryMethod) {
  try {
    const result = await apiCall('/orders', 'POST', {
      items,
      total,
      shipping_cost: shippingCost,
      discount,
      payment_method: paymentMethod,
      delivery_method: deliveryMethod
    });

    showToast('Order created successfully!');
    return result;
  } catch (error) {
    showToast('Order creation failed: ' + error.message);
    throw error;
  }
}

async function fetchUserOrders() {
  try {
    return await apiCall('/orders');
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

async function fetchOrderDetails(orderId) {
  try {
    return await apiCall(`/orders/${orderId}`);
  } catch (error) {
    console.error('Error fetching order:', error);
    return null;
  }
}

// Wishlist Functions
async function addToWishlist(productId) {
  try {
    await apiCall(`/products/${productId}/wishlist`, 'POST');
    showToast('Added to wishlist');
    updateWishlist();
  } catch (error) {
    console.error('Error adding to wishlist:', error);
  }
}

async function fetchWishlist() {
  try {
    return await apiCall('/products/wishlist/all/items');
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    return [];
  }
}

async function removeFromWishlist(productId) {
  try {
    await apiCall(`/products/${productId}/wishlist`, 'DELETE');
    showToast('Removed from wishlist');
    updateWishlist();
  } catch (error) {
    console.error('Error removing from wishlist:', error);
  }
}

// User Profile Functions
async function fetchUserProfile() {
  try {
    return await apiCall('/users/profile/me');
  } catch (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
}

async function updateUserProfile(data) {
  try {
    const result = await apiCall('/users/profile/me', 'PUT', data);
    showToast('Profile updated successfully!');
    return result;
  } catch (error) {
    showToast('Profile update failed: ' + error.message);
    throw error;
  }
}

async function changePassword(currentPassword, newPassword) {
  try {
    const result = await apiCall('/users/change-password', 'POST', {
      current_password: currentPassword,
      new_password: newPassword
    });
    showToast('Password changed successfully!');
    return result;
  } catch (error) {
    showToast('Password change failed: ' + error.message);
    throw error;
  }
}

// Payment Functions
async function processPayment(orderId, amount, paymentMethod, transactionId) {
  try {
    const result = await apiCall('/payments/process', 'POST', {
      order_id: orderId,
      amount,
      payment_method: paymentMethod,
      transaction_id: transactionId
    });

    showToast('Payment processed successfully!');
    return result;
  } catch (error) {
    showToast('Payment failed: ' + error.message);
    throw error;
  }
}

// Dashboard Stats
async function fetchDashboardStats() {
  try {
    return await apiCall('/users/stats/dashboard');
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return null;
  }
}

// Sync Products with Backend (Optional - if you want to sync from backend instead of hardcoded)
async function syncProductsFromBackend() {
  try {
    const products = await fetchProducts('all');
    // Update your PRODUCTS array
    window.PRODUCTS = products;
    console.log('Products synced from backend');
    renderShop();
    renderHome();
  } catch (error) {
    console.error('Error syncing products:', error);
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Check if user is logged in
  const token = localStorage.getItem('mn_token');
  if (token) {
    authToken = token;
    console.log('User logged in, token found');
    // Optionally fetch user data
    // fetchUserProfile().then(profile => console.log('Profile:', profile));
  }
});

// Export functions for use in HTML
window.register = register;
window.login = login;
window.logout = logout;
window.fetchProducts = fetchProducts;
window.searchProducts = searchProducts;
window.createOrder = createOrder;
window.fetchUserOrders = fetchUserOrders;
window.addToWishlist = addToWishlist;
window.removeFromWishlist = removeFromWishlist;
window.fetchWishlist = fetchWishlist;
window.updateUserProfile = updateUserProfile;
window.changePassword = changePassword;
window.processPayment = processPayment;
window.fetchDashboardStats = fetchDashboardStats;
window.syncProductsFromBackend = syncProductsFromBackend;
