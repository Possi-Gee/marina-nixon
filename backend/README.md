# Marina Nixon E-commerce Backend API

A complete Node.js/Express backend for the Marina Nixon fashion e-commerce platform with authentication, products, orders, payments, and admin features.

## Features

- ✅ User authentication & authorization (Firebase Auth)
- ✅ Product catalog with filtering & search
- ✅ Shopping cart & wishlist management
- ✅ Order management & tracking
- ✅ Payment processing (Stripe, MoMo)
- ✅ Email notifications
- ✅ Admin dashboard & analytics
- ✅ Firestore database
- ✅ Cloudinary image storage

## Installation

### Prerequisites
- Node.js (v14+)
- npm

### Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Create `.env` file:**
```bash
cp .env.example .env
```

3. **Configure environment variables** in `.env`:
```
PORT=5000
CORS_ORIGIN=https://your-domain.com
FIREBASE_PROJECT_ID=your-firebase-project-id
ADMIN_EMAIL=admin@marinanixon.com
ADMIN_PASSWORD=strong-admin-password
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_CLOUD_NAME=your_cloud_name
```

4. **Start the server:**
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The API will run at `http://localhost:5000`

In production, the backend can also serve the frontend from the same domain, so the frontend API base should be `/api`.

## API Endpoints

### Authentication

#### Register
```
POST /api/auth/register
Content-Type: application/json

{
  "first_name": "Abena",
  "last_name": "Mensah",
  "email": "abena@email.com",
  "password": "securepassword",
  "phone": "+233 24 000 0000"
}
```

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "abena@email.com",
  "password": "securepassword"
}
```

#### Verify Token
```
POST /api/auth/verify
Authorization: Bearer <token>
```

### Products

#### Get All Products
```
GET /api/products
GET /api/products?category=evening
GET /api/products?sort=price-asc
```

#### Get Single Product
```
GET /api/products/:id
```

#### Search Products
```
GET /api/products/search/:query
```

#### Add to Wishlist
```
POST /api/products/:id/wishlist
Authorization: Bearer <token>
```

#### Get Wishlist
```
GET /api/products/wishlist/all/items
Authorization: Bearer <token>
```

#### Remove from Wishlist
```
DELETE /api/products/:id/wishlist
Authorization: Bearer <token>
```

### Orders

#### Create Order
```
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
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
}
```

#### Get User Orders
```
GET /api/orders
Authorization: Bearer <token>
```

#### Get Order Details
```
GET /api/orders/:orderId
Authorization: Bearer <token>
```

#### Update Order Status
```
PATCH /api/orders/:orderId/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "shipped"
}
```

#### Cancel Order
```
POST /api/orders/:orderId/cancel
Authorization: Bearer <token>
```

### Users

#### Get Profile
```
GET /api/users/profile/me
Authorization: Bearer <token>
```

#### Update Profile
```
PUT /api/users/profile/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "first_name": "Abena",
  "last_name": "Mensah",
  "phone": "+233 24 000 0000",
  "address": "123 Cantonments Road",
  "city": "Accra",
  "region": "Greater Accra"
}
```

#### Change Password
```
POST /api/users/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "current_password": "oldpassword",
  "new_password": "newpassword"
}
```

#### Get Dashboard Stats
```
GET /api/users/stats/dashboard
Authorization: Bearer <token>
```

### Payments

#### Process Payment
```
POST /api/payments/process
Authorization: Bearer <token>
Content-Type: application/json

{
  "order_id": 1,
  "amount": 1700,
  "payment_method": "stripe",
  "transaction_id": "txn_123456"
}
```

#### Get Payment History
```
GET /api/payments/history
Authorization: Bearer <token>
```

#### Get Payment Details
```
GET /api/payments/:paymentId
Authorization: Bearer <token>
```

### Admin

#### Add Product
```
POST /api/admin/products
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "New Gown",
  "category": "evening",
  "label": "Evening Wear",
  "price": 950,
  "old_price": 1200,
  "badge": "sale",
  "stock": 20,
  "description": "Premium evening gown",
  "sizes": ["XS", "S", "M", "L", "XL"]
}
```

#### Update Product
```
PUT /api/admin/products/:productId
Authorization: Bearer <admin_token>
Content-Type: application/json
```

#### Delete Product
```
DELETE /api/admin/products/:productId
Authorization: Bearer <admin_token>
```

#### Get All Orders (Admin)
```
GET /api/admin/orders
Authorization: Bearer <admin_token>
```

#### Update Order Status (Admin)
```
PATCH /api/admin/orders/:orderId/status
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "status": "shipped"
}
```

#### Get Admin Dashboard Stats
```
GET /api/admin/stats/dashboard
Authorization: Bearer <admin_token>
```

#### Get Sales Report
```
GET /api/admin/reports/sales
Authorization: Bearer <admin_token>
```

#### Get Top Products
```
GET /api/admin/reports/top-products
Authorization: Bearer <admin_token>
```

## Database Schema

### Users
- id, first_name, last_name, email, phone, password, address, city, region, created_at

### Products
- id, name, category, label, price, old_price, badge, stock, description, sizes, created_at

### Orders
- id, user_id, order_number, total, shipping_cost, discount, status, payment_method, delivery_method, created_at

### Order Items
- id, order_id, product_id, quantity, price, size

### Wishlist
- id, user_id, product_id, created_at

### Payments
- id, order_id, amount, payment_method, transaction_id, status, created_at

## Error Handling

All endpoints return standard error responses:
```json
{
  "error": "Error message here"
}
```

Common HTTP Status Codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Server Error

## Security Notes

- Always use HTTPS in production
- Configure Firebase Security Rules to lock down Firestore
- Use environment variables for sensitive data
- Implement rate limiting in production
- Validate all user inputs
- Use CORS properly in production

## Future Enhancements

- Email notifications (Gmail/SendGrid)
- Full Stripe integration
- MoMo payment integration
- SMS notifications
- Two-factor authentication
- Inventory management
- Coupon/promo code system
- Product reviews & ratings
- Multi-currency support
- Advanced analytics

## License

MIT
