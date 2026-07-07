/**
 * ============================================================
 *  InPixel Quote — Database Layer (IndexedDB)
 * ============================================================
 *  Exposes window.DB with full CRUD for products, quotations,
 *  and settings, plus helpers for quotation numbering & stats.
 * ============================================================
 */

(function () {
  'use strict';

  const DB_NAME    = 'InPixelQuoteDB';
  const DB_VERSION = 1;

  let db = null; // holds the IDBDatabase instance

  /* ----------------------------------------------------------
   *  Helpers
   * -------------------------------------------------------- */

  /** Wrap an IDBRequest in a Promise */
  function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror   = () => reject(request.error);
    });
  }

  /** Wrap an IDBTransaction's completion in a Promise */
  function promisifyTransaction(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
      tx.onabort    = () => reject(tx.error || new DOMException('Transaction aborted'));
    });
  }

  /** Shortcut to get an object store from a new transaction */
  function getStore(storeName, mode = 'readonly') {
    const tx    = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    return { tx, store };
  }

  /* ----------------------------------------------------------
   *  Database initialisation
   * -------------------------------------------------------- */

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        // --- Products store ---
        if (!database.objectStoreNames.contains('products')) {
          const products = database.createObjectStore('products', {
            keyPath: 'id',
            autoIncrement: true,
          });
          products.createIndex('name',     'name',     { unique: false });
          products.createIndex('category', 'category', { unique: false });
        }

        // --- Quotations store ---
        if (!database.objectStoreNames.contains('quotations')) {
          const quotations = database.createObjectStore('quotations', {
            keyPath: 'id',
            autoIncrement: true,
          });
          quotations.createIndex('quotationNumber', 'quotationNumber', { unique: true  });
          quotations.createIndex('date',            'date',            { unique: false });
          quotations.createIndex('status',          'status',          { unique: false });
        }

        // --- Settings store ---
        if (!database.objectStoreNames.contains('settings')) {
          database.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /* ----------------------------------------------------------
   *  Seed default data
   * -------------------------------------------------------- */

  const DEFAULT_SETTINGS = {
    companyName:    'Your Company Name',
    address:        '',
    phone:          '',
    email:          '',
    gst:            '',
    logo:           '',
    prefix:         'Q',
    currency:       '₹',
    terms:          '1. 50% advance payment required.\n2. Delivery within 30 working days.\n3. Quotation valid for 15 days.\n4. Taxes as applicable.\n5. Subject to our standard terms and conditions.',
    lastNumber:     0,
    financialYear:  2026,
  };

  const DEFAULT_PRODUCTS = [
    {
      name:        'Modular Kitchen',
      description: 'High-gloss acrylic finish with SS hardware',
      category:    'Interior',
      unit:        'Sq.ft',
      rate:        1850,
      hsn:         '9403',
      createdAt:   new Date().toISOString(),
    },
    {
      name:        'Wardrobe',
      description: 'Sliding door wardrobe with mirror',
      category:    'Interior',
      unit:        'Nos',
      rate:        85000,
      hsn:         '9403',
      createdAt:   new Date().toISOString(),
    },
    {
      name:        'TV Unit',
      description: 'MDF laminate finish entertainment unit',
      category:    'Interior',
      unit:        'Nos',
      rate:        35000,
      hsn:         '9403',
      createdAt:   new Date().toISOString(),
    },
    {
      name:        'Study Table',
      description: 'Engineered wood with drawer storage',
      category:    'Furniture',
      unit:        'Nos',
      rate:        18000,
      hsn:         '9403',
      createdAt:   new Date().toISOString(),
    },
    {
      name:        'Shoe Rack',
      description: 'Solid teak wood shoe cabinet',
      category:    'Furniture',
      unit:        'Nos',
      rate:        12000,
      hsn:         '9403',
      createdAt:   new Date().toISOString(),
    },
    {
      name:        'False Ceiling',
      description: 'Gypsum board with LED cove lighting',
      category:    'Interior',
      unit:        'Sq.ft',
      rate:        95,
      hsn:         '6809',
      createdAt:   new Date().toISOString(),
    },
  ];

  async function seedDefaults() {
    // Check if settings already seeded (look for companyName key)
    const existing = await getSetting('companyName');
    if (existing !== undefined) return; // already seeded

    // Seed settings
    const { tx: sTx, store: sStore } = getStore('settings', 'readwrite');
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      sStore.put({ key, value });
    }
    await promisifyTransaction(sTx);

    // Seed products
    const { tx: pTx, store: pStore } = getStore('products', 'readwrite');
    for (const product of DEFAULT_PRODUCTS) {
      pStore.add(product);
    }
    await promisifyTransaction(pTx);
  }

  /* ----------------------------------------------------------
   *  Products API
   * -------------------------------------------------------- */

  function addProduct(product) {
    product.createdAt = product.createdAt || new Date().toISOString();
    const { store } = getStore('products', 'readwrite');
    return promisifyRequest(store.add(product));
  }

  function updateProduct(product) {
    if (!product.id) return Promise.reject(new Error('Product id is required'));
    const { store } = getStore('products', 'readwrite');
    return promisifyRequest(store.put(product));
  }

  function deleteProduct(id) {
    const { store } = getStore('products', 'readwrite');
    return promisifyRequest(store.delete(id));
  }

  function getProduct(id) {
    const { store } = getStore('products');
    return promisifyRequest(store.get(id));
  }

  function getAllProducts() {
    return new Promise((resolve, reject) => {
      const { store } = getStore('products');
      const request   = store.index('name').openCursor();
      const results   = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results); // already sorted by name via index
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  function searchProducts(query) {
    return new Promise((resolve, reject) => {
      if (!query || !query.trim()) {
        return getAllProducts().then(resolve).catch(reject);
      }

      const q       = query.trim().toLowerCase();
      const { store } = getStore('products');
      const request   = store.openCursor();
      const results   = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const p = cursor.value;
          if (
            (p.name        && p.name.toLowerCase().includes(q)) ||
            (p.description && p.description.toLowerCase().includes(q)) ||
            (p.category    && p.category.toLowerCase().includes(q))
          ) {
            results.push(p);
          }
          cursor.continue();
        } else {
          results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /* ----------------------------------------------------------
   *  Quotations API
   * -------------------------------------------------------- */

  function addQuotation(quotation) {
    quotation.createdAt = quotation.createdAt || new Date().toISOString();
    const { store } = getStore('quotations', 'readwrite');
    return promisifyRequest(store.add(quotation));
  }

  function updateQuotation(quotation) {
    if (!quotation.id) return Promise.reject(new Error('Quotation id is required'));
    const { store } = getStore('quotations', 'readwrite');
    return promisifyRequest(store.put(quotation));
  }

  function deleteQuotation(id) {
    const { store } = getStore('quotations', 'readwrite');
    return promisifyRequest(store.delete(id));
  }

  function getQuotation(id) {
    const { store } = getStore('quotations');
    return promisifyRequest(store.get(id));
  }

  function getAllQuotations() {
    return new Promise((resolve, reject) => {
      const { store } = getStore('quotations');
      const request   = store.openCursor();
      const results   = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          // Sort by createdAt descending
          results.sort((a, b) => {
            const da = a.createdAt || '';
            const db_ = b.createdAt || '';
            return db_.localeCompare(da);
          });
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  function searchQuotations(query, dateFrom, dateTo) {
    return new Promise((resolve, reject) => {
      const q         = (query || '').trim().toLowerCase();
      const { store } = getStore('quotations');
      const request   = store.openCursor();
      const results   = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const rec  = cursor.value;
          let match = true;

          // Text filter
          if (q) {
            const numMatch  = rec.quotationNumber && rec.quotationNumber.toLowerCase().includes(q);
            const nameMatch = rec.customer && rec.customer.name && rec.customer.name.toLowerCase().includes(q);
            if (!numMatch && !nameMatch) match = false;
          }

          // Date range filter
          if (match && dateFrom) {
            if (rec.date < dateFrom) match = false;
          }
          if (match && dateTo) {
            if (rec.date > dateTo) match = false;
          }

          if (match) results.push(rec);
          cursor.continue();
        } else {
          results.sort((a, b) => {
            const da = a.createdAt || '';
            const db_ = b.createdAt || '';
            return db_.localeCompare(da);
          });
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /* ----------------------------------------------------------
   *  Settings API
   * -------------------------------------------------------- */

  function setSetting(key, value) {
    const { store } = getStore('settings', 'readwrite');
    return promisifyRequest(store.put({ key, value }));
  }

  function getSetting(key) {
    return new Promise((resolve, reject) => {
      const { store } = getStore('settings');
      const request   = store.get(key);

      request.onsuccess = () => {
        resolve(request.result ? request.result.value : undefined);
      };
      request.onerror = () => reject(request.error);
    });
  }

  function getAllSettings() {
    return new Promise((resolve, reject) => {
      const { store } = getStore('settings');
      const request   = store.openCursor();
      const result    = {};

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          result[cursor.value.key] = cursor.value.value;
          cursor.continue();
        } else {
          resolve(result);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /* ----------------------------------------------------------
   *  Quotation number generator
   * -------------------------------------------------------- */

  async function getNextQuotationNumber() {
    const prefix        = (await getSetting('prefix'))        || 'Q';
    let   lastNumber    = (await getSetting('lastNumber'))    || 0;
    let   financialYear = (await getSetting('financialYear')) || new Date().getFullYear();

    const currentYear = new Date().getFullYear();

    // Reset counter when year changes
    if (currentYear !== financialYear) {
      lastNumber    = 0;
      financialYear = currentYear;
      await setSetting('financialYear', financialYear);
    }

    lastNumber += 1;
    await setSetting('lastNumber', lastNumber);

    return `${prefix}-${currentYear}-${String(lastNumber).padStart(3, '0')}`;
  }

  /* ----------------------------------------------------------
   *  Statistics
   * -------------------------------------------------------- */

  async function getStats() {
    const allQuotations = await getAllQuotations();
    const allProducts   = await getAllProducts();

    const now      = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();

    let monthCount = 0;
    let monthValue = 0;

    for (const q of allQuotations) {
      const d = new Date(q.createdAt || q.date);
      if (d.getFullYear() === thisYear && d.getMonth() === thisMonth) {
        monthCount++;
        monthValue += (q.grandTotal || 0);
      }
    }

    return {
      totalQuotations: allQuotations.length,
      totalProducts:   allProducts.length,
      thisMonth:       monthCount,
      thisMonthValue:  monthValue,
    };
  }

  /* ----------------------------------------------------------
   *  Public init()
   * -------------------------------------------------------- */

  async function init() {
    await openDatabase();
    await seedDefaults();
  }

  /* ----------------------------------------------------------
   *  Expose on window
   * -------------------------------------------------------- */

  window.DB = {
    init,

    // Products
    addProduct,
    updateProduct,
    deleteProduct,
    getProduct,
    getAllProducts,
    searchProducts,

    // Quotations
    addQuotation,
    updateQuotation,
    deleteQuotation,
    getQuotation,
    getAllQuotations,
    searchQuotations,

    // Settings
    setSetting,
    getSetting,
    getAllSettings,

    // Counter
    getNextQuotationNumber,

    // Stats
    getStats,
  };
})();
