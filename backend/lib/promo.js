const PROMO_CODES = {
  NIXON10: { discount_type: 'percent', discount_value: 10 },
  WELCOME10: { discount_type: 'percent', discount_value: 10 },
  WELCOME20: { discount_type: 'percent', discount_value: 20 },
  FREESHIP: { discount_type: 'fixed', discount_value: 30 },
};

function getPromoDetails(code) {
  if (!code) return null;
  const key = String(code).trim().toUpperCase();
  return PROMO_CODES[key] ? { code: key, ...PROMO_CODES[key] } : null;
}

function calculateDiscount(promo, subtotal) {
  if (!promo || !subtotal || subtotal <= 0) return 0;
  if (promo.discount_type === 'percent') {
    return Math.round((subtotal * promo.discount_value) / 100 * 100) / 100;
  }
  if (promo.discount_type === 'fixed') {
    return Math.min(subtotal, promo.discount_value);
  }
  return 0;
}

module.exports = {
  PROMO_CODES,
  getPromoDetails,
  calculateDiscount,
};
