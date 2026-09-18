const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.MAIL_HOST;
  if (!host || host === 'smtp.example.com') return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.MAIL_PORT || 587),
    secure: Number(process.env.MAIL_PORT) === 465,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
  return transporter;
}

function renderOrderHtml(order, items) {
  const rows = (items || []).map((item) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee">${item.name || item.product_id}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${item.quantity || 1}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">GH₵ ${Number(item.price || 0).toFixed(2)}</td>
    </tr>`).join('');

  return `
    <h2 style="color:#C9A96E;letter-spacing:2.5px;text-transform:uppercase;font-size:18px">Marina Nixon · Wear Rina</h2>
    <p style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8C7B6B;margin-top:-6px;margin-bottom:14px">A Signature of Luxury</p>
    <p>Thank you for your order!</p>
    <p><strong>Order:</strong> ${order.order_number}<br>
    <strong>Status:</strong> ${order.payment_status === 'paid' ? 'Paid' : 'Payment pending'}</p>
    <table style="width:100%;border-collapse:collapse">
      <tr style="background:#F5F0E8">
        <th style="text-align:left;padding:8px 10px">Item</th>
        <th style="text-align:center;padding:8px 10px">Qty</th>
        <th style="text-align:right;padding:8px 10px">Price</th>
      </tr>
      ${rows}
      <tr><td colspan="2" style="text-align:right;padding:8px 10px"><strong>Total</strong></td>
      <td style="text-align:right;padding:8px 10px"><strong>GH₵ ${Number(order.total || 0).toFixed(2)}</strong></td></tr>
    </table>
    <p style="color:#8C7B6B;font-size:13px">We'll send tracking details once your pieces are on the way.</p>
  </div>`;
}

async function sendOrderConfirmation({ to, order, items }) {
  const transport = getTransporter();
  if (!transport) return { skipped: true, reason: 'mail not configured' };
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || 'Marina Nixon <no-reply@marinanixon.com>',
      to,
      subject: `Order ${order.reference} received - Marina Nixon`,
      html: renderOrderHtml(order, items),
    });
    return { ok: true };
  } catch (err) {
    return { skipped: true, reason: err.message };
  }
}

module.exports = { sendOrderConfirmation, getTransporter };