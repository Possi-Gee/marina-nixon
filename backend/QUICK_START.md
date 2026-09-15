# Marina Nixon Backend - Quick Start Guide

## 📋 What's Included

### Core Files
- **server.js** - Main Express server
- **package.json** - Dependencies & scripts
- **.env.example** - Environment variables template

### Routes (API Endpoints)
- **routes/auth.js** - User registration & login
- **routes/products.js** - Product listing, search, wishlist
- **routes/orders.js** - Order creation & management
- **routes/users.js** - User profile & settings
- **routes/payments.js** - Payment processing
- **routes/admin.js** - Admin dashboard & analytics

### Middleware
- **middleware/auth.js** - Firebase ID token authentication & admin checks

### Database
- **Firestore** - collections are created on boot
- **Cloudinary** - product images are stored remotely

### Utilities
- **seed.js** - Populate database with sample data
- **FRONTEND_INTEGRATION.js** - Connect frontend HTML to backend API

---

## 🚀 Getting Started

### Step 1: Install Dependencies
```bash
cd backend
npm install
```

### Step 2: Create .env File
```bash
cp .env.example .env
```

Edit `.env` and set:
```
PORT=5000
CORS_ORIGIN=https://your-domain.com
FIREBASE_PROJECT_ID=your-firebase-project-id
ADMIN_EMAIL=admin@marinanixon.com
ADMIN_PASSWORD=strong-admin-password
CLOUDINARY_CLOUD_NAME=your_cloud_name
```

### Step 3: Seed Database (Optional)
```bash
node seed.js
```

This adds:
- 18 products (women's & men's)
- 1 sample user (abena@email.com / password123)

### Step 4: Start Server
```bash
npm start
```

Server runs on `http://localhost:5000`

For production, deploy the backend and frontend on the same domain and keep the frontend API base as `/api`.

---

## 🧪 Test the API

### 1. Register a New User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com",
    "password": "password123",
    "phone": "+233 24 111 1111"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "password": "password123"
  }'
```

Save the `token` from response.

### 3. Get Products
```bash
curl http://localhost:5000/api/products
curl "http://localhost:5000/api/products?category=evening&sort=price-asc"
```

### 4. Create an Order
```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "product_id": 1,
        "quantity": 2,
        "price": 850,
        "size": "M"
      }
    ],
    "total": 1700,
    "shipping_cost": 30,
    "discount": 0,
    "payment_method": "momo",
    "delivery_method": "express"
  }'
```

---

## 🔗 Connect Frontend

### Option 1: Use Provided Integration Script
Add to your HTML file:
```html
<script src="backend/FRONTEND_INTEGRATION.js"></script>
```

Then use functions like:
```javascript
// Register
await register('John', 'Doe', 'john@example.com', 'password123', '+233 24 000 0000');

// Login
await login('john@example.com', 'password123');

// Fetch Products
const products = await fetchProducts('evening');

// Create Order
await createOrder(items, total, shippingCost, discount, 'momo', 'express');
```

### Option 2: Manual Integration
Update your existing `addToCart` and checkout functions to call the API:

```javascript
async function proceedCheckout() {
  try {
    // Get cart items
    const items = cart.map(item => ({
      product_id: item.id,
      quantity: item.qty,
      price: item.price,
      size: item.size
    }));

    // Create order via API
    const order = await createOrder(
      items,
      cartTotal(),
      30, // shipping
      0, // discount
      'momo',
      'express'
    );

    go('checkout');
    // ... rest of checkout logic
  } catch (error) {
    showToast('Checkout failed: ' + error.message);
  }
}
```

---

## 📊 Sample Credentials

After running `seed.js`:

**Email:** abena@email.com  
**Password:** password123

---

## 🔐 Security Checklist

- [ ] Set up Firebase Security Rules for Firestore
- [ ] Enable HTTPS
- [ ] Set up CORS properly
- [ ] Add rate limiting
- [ ] Validate all inputs
- [ ] Use environment variables for secrets
- [ ] Set up SSL certificates
- [ ] Enable HTTPS on database connections

---

## 📚 API Documentation

See **README.md** for complete API endpoints documentation.

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Use different port
PORT=5001 npm start
```

### Database Lock Error
```bash
# Delete database and restart
rm marina_nixon.db
npm start
```

### Module Not Found
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## 🚢 Production Deployment

### Before deploying:
1. Change all secrets in `.env`
2. Set `NODE_ENV=production`
3. Enable HTTPS/SSL
4. Set up proper CORS
5. Add rate limiting
6. Set up database backups
7. Configure payment webhooks
8. Set up email service
9. Enable monitoring/logging

### Deploy to services like:
- Heroku
- DigitalOcean
- AWS Lambda
- Google Cloud
- Azure App Service

---

## 📞 Support

For issues or questions, check the README.md file for more detailed documentation.

Happy coding! 🎉
