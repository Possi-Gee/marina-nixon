/**
 * localdb.js — Simple JSON file-based fallback database.
 * Used when Firestore is not configured / available.
 * Stores data in backend/data/*.json files.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readCollection(name) {
  ensureDataDir();
  const file = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function writeCollection(name, data) {
  ensureDataDir();
  const file = path.join(DATA_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function addDoc(collection, doc) {
  const records = readCollection(collection);
  const id = doc.id || generateId();
  const record = { ...doc, id };
  records.push(record);
  writeCollection(collection, records);
  return record;
}

function getDoc(collection, id) {
  const records = readCollection(collection);
  return records.find((r) => r.id === String(id)) || null;
}

function updateDoc(collection, id, updates) {
  const records = readCollection(collection);
  const idx = records.findIndex((r) => r.id === String(id));
  if (idx === -1) return null;
  records[idx] = { ...records[idx], ...updates };
  writeCollection(collection, records);
  return records[idx];
}

function queryDocs(collection, field, value) {
  const records = readCollection(collection);
  return records.filter((r) => String(r[field]) === String(value));
}

function getAllDocs(collection) {
  return readCollection(collection);
}

const DEFAULT_SETTINGS = {
  id: 'main',
  momo_number: '0592785320',
  momo_name: 'Marina Nixon Atelier',
  momo_network: 'MTN Mobile Money',
  momo_instructions: 'Transfer to our official MoMo number, use your Order Number as reference, and share the screenshot on WhatsApp for instant confirmation.',
  whatsapp_number: '233592785320',
  cod_active: true,
  delivery_regions: ['Greater Accra','Ashanti','Western','Western North','Central','Eastern','Volta','Oti','Northern','Savannah','North East','Upper East','Upper West','Bono','Bono East','Ahafo'],
  standard_shipping_fee: 30,
  express_shipping_fee: 60,
  free_shipping_threshold: 500,
  free_shipping_active: true,
  express_delivery_active: true,
  pickup_active: true,
  delivery_notice: '',
  custom_neighborhoods: 'Airport Residential, Cantonments, East Legon, Labone, Osu, Spintex Road, Dzorwulu, Ridge, Roman Ridge, Legon, Tema, Kumasi Central, Ahodwo, Takoradi Central'
};

function getSettings() {
  const settings = readCollection('site_settings');
  const found = settings.find((s) => s.id === 'main');
  return found ? { ...DEFAULT_SETTINGS, ...found } : { ...DEFAULT_SETTINGS };
}

function saveSettings(updates = {}) {
  const settings = readCollection('site_settings');
  const idx = settings.findIndex((s) => s.id === 'main');
  const current = idx >= 0 ? settings[idx] : { ...DEFAULT_SETTINGS };
  const merged = { ...current, ...updates, id: 'main', updated_at: new Date().toISOString() };
  if (idx >= 0) {
    settings[idx] = merged;
  } else {
    settings.push(merged);
  }
  writeCollection('site_settings', settings);
  return merged;
}

module.exports = {
  addDoc,
  getDoc,
  updateDoc,
  queryDocs,
  getAllDocs,
  generateId,
  getSettings,
  saveSettings,
  DEFAULT_SETTINGS
};

