/**
 * ============================================================
 *  InPixel Quote — Main Application Controller
 * ============================================================
 *  Depends on:
 *    - window.DB        (db.js)
 *    - window.jspdf     (jsPDF CDN)
 *    - jspdf-autotable  (autoTable plugin CDN)
 * ============================================================
 */

(function () {
  'use strict';

  /* ================================================================
   *  §1  APPLICATION STATE
   * ============================================================== */

  const AppState = {
    currentView: 'dashboard',
    editingProductId: null,
    currentQuotation: {
      id: null,
      quotationNumber: '',
      date: new Date().toISOString().split('T')[0],
      customer: {
        name: '',
        phone: '',
        email: '',
        address: '',
        gst: '',
        projectLocation: '',
      },
      items: [], // { productId, name, description, qty, unit, rate, amount }
      discountPercent: 0,
      gstRate: 18,
      notes: '',
      status: 'draft',
    },
    viewingQuotationId: null,
    settings: {},
    confirmCallback: null,
  };

  /* ================================================================
   *  §2  UTILITY FUNCTIONS
   * ============================================================== */

  // ── 2.1  Currency formatting ──────────────────────────────────────

  /**
   * Format a number as Indian currency with the configured symbol.
   * Example: 125000 → ₹1,25,000.00
   */
  function formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    const formatted = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(num));
    const symbol = AppState.settings.currency || '₹';
    return `${num < 0 ? '-' : ''}${symbol}${formatted}`;
  }

  /**
   * Format number without currency symbol (for PDF table cells).
   */
  function formatCurrencyPlain(amount) {
    const num = parseFloat(amount) || 0;
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }

  // ── 2.2  Date formatting ─────────────────────────────────────────

  /**
   * Convert ISO date string to DD/MM/YYYY.
   */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  // ── 2.3  Toast notifications ──────────────────────────────────────

  /**
   * Show a toast message. Types: 'success' | 'error' | 'info'
   */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
      error:   '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
      info:    '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    // Trigger reflow so the enter animation works
    toast.offsetHeight; // eslint-disable-line no-unused-expressions

    toast.classList.add('toast-visible');

    setTimeout(() => {
      toast.classList.remove('toast-visible');
      toast.classList.add('toast-hiding');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  // ── 2.4  Confirmation dialog ──────────────────────────────────────

  function showConfirm(title, message, callback) {
    const modal  = document.getElementById('confirm-modal');
    const tEl    = document.getElementById('confirm-title');
    const mEl    = document.getElementById('confirm-message');

    if (tEl) tEl.textContent = title;
    if (mEl) mEl.textContent = message;

    AppState.confirmCallback = callback;

    if (modal) modal.classList.add('active');
  }

  function closeConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.remove('active');
    AppState.confirmCallback = null;
  }

  // ── 2.5  Debounce ─────────────────────────────────────────────────

  function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ── 2.6  Number to words (Indian system) ─────────────────────────

  /**
   * Convert a number to Indian English words.
   * Handles up to 99,99,99,999 (99 crore+).
   * Returns: "Rupees One Lakh Twenty Five Thousand Only"
   */
  function numberToWords(num) {
    if (num === 0) return 'Rupees Zero Only';

    const ones = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
      'Seventeen', 'Eighteen', 'Nineteen',
    ];

    const tens = [
      '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
      'Sixty', 'Seventy', 'Eighty', 'Ninety',
    ];

    function twoDigits(n) {
      if (n < 20) return ones[n];
      return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    }

    function threeDigits(n) {
      if (n === 0) return '';
      let str = '';
      if (n >= 100) {
        str += ones[Math.floor(n / 100)] + ' Hundred';
        n %= 100;
        if (n > 0) str += ' ';
      }
      str += twoDigits(n);
      return str;
    }

    // Split into integer and decimal
    const absNum   = Math.abs(num);
    const parts    = absNum.toFixed(2).split('.');
    const integer  = parseInt(parts[0], 10);
    const decimal  = parseInt(parts[1], 10);

    // Indian grouping: last 3 digits, then groups of 2
    // Crores | Lakhs | Thousands | Hundreds + Tens + Ones
    let integerWords = '';

    if (integer === 0) {
      integerWords = 'Zero';
    } else {
      let remaining = integer;

      // Crores (groups of 2 digits, each pair up to 99)
      const crores = Math.floor(remaining / 10000000);
      remaining %= 10000000;

      const lakhs = Math.floor(remaining / 100000);
      remaining %= 100000;

      const thousands = Math.floor(remaining / 1000);
      remaining %= 1000;

      const rest = remaining; // 0-999

      const segments = [];

      if (crores > 0) {
        segments.push(twoDigits(crores) + ' Crore');
      }
      if (lakhs > 0) {
        segments.push(twoDigits(lakhs) + ' Lakh');
      }
      if (thousands > 0) {
        segments.push(twoDigits(thousands) + ' Thousand');
      }
      if (rest > 0) {
        segments.push(threeDigits(rest));
      }

      integerWords = segments.join(' ');
    }

    let result = 'Rupees ' + integerWords;

    if (decimal > 0) {
      result += ' and ' + twoDigits(decimal) + ' Paise';
    }

    result += ' Only';
    return result;
  }

  // ── 2.7  Escape HTML ─────────────────────────────────────────────

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /* ================================================================
   *  §3  NAVIGATION
   * ============================================================== */

  function navigateTo(viewName) {
    // Deactivate all nav items and views
    document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));

    // Activate matching nav item
    const navItem = document.getElementById('nav-' + viewName);
    if (navItem) navItem.classList.add('active');

    // Activate matching view
    const view = document.getElementById('view-' + viewName);
    if (view) view.classList.add('active');

    AppState.currentView = viewName;

    // Close sidebar on mobile
    const sidebar = document.getElementById('sidebar');
    if (sidebar && window.innerWidth <= 768) {
      sidebar.classList.remove('open');
    }

    // Load view data
    switch (viewName) {
      case 'dashboard':
        loadDashboard();
        break;
      case 'products':
        loadProducts();
        break;
      case 'new-quotation':
        loadQuotationView();
        break;
      case 'history':
        loadHistory();
        break;
      case 'settings':
        loadSettings();
        break;
    }
  }

  /**
   * Called when navigating to new-quotation. If there's no quotation number
   * in state, generate one.
   */
  async function loadQuotationView() {
    if (!AppState.currentQuotation.quotationNumber) {
      try {
        const nextNum = await DB.getNextQuotationNumber();
        document.getElementById('q-number').value = nextNum;
        AppState.currentQuotation.quotationNumber  = nextNum;
      } catch (err) {
        console.error('Failed to generate quotation number', err);
      }
    }
    renderQuotationItems();
    recalculate();
  }

  /* ================================================================
   *  §4  DASHBOARD
   * ============================================================== */

  async function loadDashboard() {
    try {
      const stats = await DB.getStats();

      setTextContent('stat-quotations', stats.totalQuotations);
      setTextContent('stat-products',   stats.totalProducts);
      setTextContent('stat-month',      stats.thisMonth);
      setTextContent('stat-value',      formatCurrency(stats.thisMonthValue));

      // Recent quotations
      const all  = await DB.getAllQuotations();
      const recent = all.slice(0, 10);
      const tbody  = document.getElementById('recent-quotations-body');
      const empty  = document.getElementById('dashboard-empty');

      if (!tbody) return;

      if (recent.length === 0) {
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        return;
      }

      if (empty) empty.style.display = 'none';

      tbody.innerHTML = recent
        .map(
          (q, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>
            <span class="quotation-number">${escapeHtml(q.quotationNumber)}</span>
          </td>
          <td>${escapeHtml(q.customer ? q.customer.name : '')}</td>
          <td>${formatDate(q.date)}</td>
          <td class="text-right">${formatCurrency(q.grandTotal)}</td>
          <td><span class="badge badge-${q.status === 'final' ? 'success' : 'warning'}">${q.status === 'final' ? 'Final' : 'Draft'}</span></td>
          <td class="actions-cell">
            <button class="btn-icon" title="View" data-action="view-quotation" data-id="${q.id}">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            </button>
            <button class="btn-icon" title="Export PDF" data-action="pdf-quotation" data-id="${q.id}">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </button>
          </td>
        </tr>
      `
        )
        .join('');
    } catch (err) {
      console.error('Dashboard load error:', err);
    }
  }

  /* ================================================================
   *  §5  PRODUCTS MANAGEMENT
   * ============================================================== */

  async function loadProducts() {
    try {
      const products = await DB.getAllProducts();
      renderProductsTable(products);
    } catch (err) {
      console.error('Load products error:', err);
      showToast('Failed to load products', 'error');
    }
  }

  function renderProductsTable(products) {
    const tbody = document.getElementById('products-tbody');
    const empty = document.getElementById('products-empty');
    if (!tbody) return;

    if (!products || products.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }

    if (empty) empty.style.display = 'none';

    tbody.innerHTML = products
      .map(
        (p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="product-name-cell">${escapeHtml(p.name)}</td>
        <td class="desc-cell" title="${escapeHtml(p.description)}">${escapeHtml(truncate(p.description, 50))}</td>
        <td><span class="badge badge-category">${escapeHtml(p.category)}</span></td>
        <td>${escapeHtml(p.unit)}</td>
        <td class="text-right">${formatCurrency(p.rate)}</td>
        <td class="actions-cell">
          <button class="btn-icon btn-edit" title="Edit" data-action="edit-product" data-id="${p.id}">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button class="btn-icon btn-delete" title="Delete" data-action="delete-product" data-id="${p.id}">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </td>
      </tr>
    `
      )
      .join('');
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '…' : str;
  }

  function openProductModal(id = null) {
    const modal    = document.getElementById('product-modal');
    const titleEl  = document.getElementById('product-modal-title');
    const form     = document.getElementById('product-form');

    if (!modal) return;

    if (id) {
      AppState.editingProductId = id;
      if (titleEl) titleEl.textContent = 'Edit Product';

      DB.getProduct(id).then((product) => {
        if (!product) return;
        document.getElementById('p-id').value   = product.id;
        document.getElementById('p-name').value  = product.name || '';
        document.getElementById('p-desc').value  = product.description || '';
        document.getElementById('p-category').value = product.category || '';
        document.getElementById('p-unit').value  = product.unit || '';
        document.getElementById('p-rate').value  = product.rate || '';
        document.getElementById('p-hsn').value   = product.hsn || '';
      });
    } else {
      AppState.editingProductId = null;
      if (titleEl) titleEl.textContent = 'Add Product';
      if (form) form.reset();
      document.getElementById('p-id').value = '';
    }

    modal.classList.add('active');
  }

  function closeProductModal() {
    const modal = document.getElementById('product-modal');
    const form  = document.getElementById('product-form');
    if (modal) modal.classList.remove('active');
    if (form) form.reset();
    document.getElementById('p-id').value = '';
    AppState.editingProductId = null;
  }

  async function saveProduct() {
    const name = (document.getElementById('p-name').value || '').trim();
    const rate = parseFloat(document.getElementById('p-rate').value);

    if (!name) {
      showToast('Product name is required', 'error');
      return;
    }
    if (!rate || rate <= 0) {
      showToast('Valid rate is required', 'error');
      return;
    }

    const product = {
      name,
      description: (document.getElementById('p-desc').value || '').trim(),
      category:    (document.getElementById('p-category').value || '').trim(),
      unit:        (document.getElementById('p-unit').value || '').trim(),
      rate,
      hsn:         (document.getElementById('p-hsn').value || '').trim(),
    };

    try {
      const existingId = document.getElementById('p-id').value;
      if (existingId) {
        product.id = parseInt(existingId, 10);
        // Preserve createdAt
        const existing = await DB.getProduct(product.id);
        if (existing) product.createdAt = existing.createdAt;
        await DB.updateProduct(product);
        showToast('Product updated successfully', 'success');
      } else {
        product.createdAt = new Date().toISOString();
        await DB.addProduct(product);
        showToast('Product added successfully', 'success');
      }

      closeProductModal();
      await loadProducts();
    } catch (err) {
      console.error('Save product error:', err);
      showToast('Failed to save product', 'error');
    }
  }

  function deleteProduct(id) {
    showConfirm('Delete Product', 'Are you sure you want to delete this product? This action cannot be undone.', async () => {
      try {
        await DB.deleteProduct(id);
        showToast('Product deleted', 'success');
        await loadProducts();
      } catch (err) {
        console.error('Delete product error:', err);
        showToast('Failed to delete product', 'error');
      }
    });
  }

  /* ================================================================
   *  §6  SETTINGS
   * ============================================================== */

  async function loadSettings() {
    try {
      const settings = await DB.getAllSettings();
      AppState.settings = settings;

      setFieldValue('s-company-name', settings.companyName || '');
      setFieldValue('s-address',      settings.address || '');
      setFieldValue('s-phone',        settings.phone || '');
      setFieldValue('s-email',        settings.email || '');
      setFieldValue('s-gst',          settings.gst || '');
      setFieldValue('s-prefix',       settings.prefix || 'Q');
      setFieldValue('s-currency',     settings.currency || '₹');
      setFieldValue('s-terms',        settings.terms || '');

      // Logo preview
      const preview = document.getElementById('s-logo-preview');
      if (preview) {
        if (settings.logo) {
          preview.innerHTML = `<img src="${settings.logo}" alt="Logo" />`;
        } else {
          preview.innerHTML = '<span class="no-logo">No logo uploaded</span>';
        }
      }
    } catch (err) {
      console.error('Load settings error:', err);
      showToast('Failed to load settings', 'error');
    }
  }

  async function saveSettings() {
    try {
      const fields = {
        companyName: 's-company-name',
        address:     's-address',
        phone:       's-phone',
        email:       's-email',
        gst:         's-gst',
        prefix:      's-prefix',
        currency:    's-currency',
        terms:       's-terms',
      };

      for (const [key, elId] of Object.entries(fields)) {
        const el = document.getElementById(elId);
        if (el) {
          await DB.setSetting(key, el.value);
        }
      }

      // Logo is handled separately via file upload
      AppState.settings = await DB.getAllSettings();
      showToast('Settings saved successfully', 'success');
    } catch (err) {
      console.error('Save settings error:', err);
      showToast('Failed to save settings', 'error');
    }
  }

  function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate type
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }

    // Validate size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image must be smaller than 2 MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;

      try {
        await DB.setSetting('logo', base64);
        AppState.settings.logo = base64;

        const preview = document.getElementById('s-logo-preview');
        if (preview) {
          preview.innerHTML = `<img src="${base64}" alt="Logo" />`;
        }

        showToast('Logo uploaded', 'success');
      } catch (err) {
        console.error('Logo upload error:', err);
        showToast('Failed to save logo', 'error');
      }
    };

    reader.readAsDataURL(file);
  }

  async function clearLogo() {
    try {
      await DB.setSetting('logo', '');
      AppState.settings.logo = '';

      const preview = document.getElementById('s-logo-preview');
      if (preview) {
        preview.innerHTML = '<span class="no-logo">No logo uploaded</span>';
      }

      const input = document.getElementById('s-logo-input');
      if (input) input.value = '';

      showToast('Logo removed', 'info');
    } catch (err) {
      console.error('Clear logo error:', err);
    }
  }

  /* ================================================================
   *  §7  QUOTATION BUILDER
   * ============================================================== */

  // ── 7.1  Item search & add ────────────────────────────────────────

  const handleItemSearch = debounce(async function () {
    const input   = document.getElementById('q-item-search');
    const results = document.getElementById('q-item-results');
    if (!input || !results) return;

    const query = input.value.trim();

    if (query.length < 2) {
      results.innerHTML = '';
      results.classList.remove('active');
      return;
    }

    try {
      const products = await DB.searchProducts(query);

      if (products.length === 0) {
        results.innerHTML = '<div class="search-result-item no-result">No products found</div>';
        results.classList.add('active');
        return;
      }

      results.innerHTML = products
        .map(
          (p) => `
        <div class="search-result-item" data-product-id="${p.id}">
          <div class="result-name">${escapeHtml(p.name)}</div>
          <div class="result-details">
            <span class="result-category">${escapeHtml(p.category)}</span>
            <span class="result-unit">${escapeHtml(p.unit)}</span>
            <span class="result-rate">${formatCurrency(p.rate)}</span>
          </div>
        </div>
      `
        )
        .join('');

      results.classList.add('active');
    } catch (err) {
      console.error('Item search error:', err);
    }
  }, 200);

  async function addItemFromSearch(productId) {
    try {
      const product = await DB.getProduct(productId);
      if (!product) return;

      const item = {
        productId:   product.id,
        name:        product.name,
        description: product.description || '',
        qty:         1,
        unit:        product.unit || 'Nos',
        rate:        product.rate || 0,
        amount:      product.rate || 0,
      };

      AppState.currentQuotation.items.push(item);

      // Clear search
      const input   = document.getElementById('q-item-search');
      const results = document.getElementById('q-item-results');
      if (input)   input.value = '';
      if (results) {
        results.innerHTML = '';
        results.classList.remove('active');
      }

      renderQuotationItems();
      recalculate();
    } catch (err) {
      console.error('Add item error:', err);
      showToast('Failed to add item', 'error');
    }
  }

  // ── 7.2  Render quotation items ──────────────────────────────────

  function renderQuotationItems() {
    const tbody = document.getElementById('q-items-tbody');
    const empty = document.getElementById('q-items-empty');
    if (!tbody) return;

    const items = AppState.currentQuotation.items;

    if (items.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }

    if (empty) empty.style.display = 'none';

    tbody.innerHTML = items
      .map(
        (item, i) => `
      <tr data-index="${i}">
        <td>${i + 1}</td>
        <td class="item-name-cell">${escapeHtml(item.name)}</td>
        <td class="desc-cell" title="${escapeHtml(item.description)}">${escapeHtml(truncate(item.description, 35))}</td>
        <td><input type="number" class="input-inline item-qty" min="1" step="any" value="${item.qty}" data-index="${i}" /></td>
        <td>${escapeHtml(item.unit)}</td>
        <td><input type="number" class="input-inline item-rate" min="0" step="any" value="${item.rate}" data-index="${i}" /></td>
        <td class="text-right item-amount">${formatCurrency(item.amount)}</td>
        <td class="actions-cell">
          <button class="btn-icon btn-delete item-remove" data-index="${i}" title="Remove">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </td>
      </tr>
    `
      )
      .join('');
  }

  // ── 7.3  Recalculate totals ──────────────────────────────────────

  function recalculate() {
    const items = AppState.currentQuotation.items;

    const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

    const discountPercentEl = document.getElementById('q-discount-percent');
    const gstRateEl         = document.getElementById('q-gst-rate');

    const discountPercent = parseFloat(discountPercentEl ? discountPercentEl.value : 0) || 0;
    const gstRate         = parseFloat(gstRateEl ? gstRateEl.value : 0) || 0;

    const discountAmount = subtotal * discountPercent / 100;
    const taxableAmount  = subtotal - discountAmount;
    const gstAmount      = taxableAmount * gstRate / 100;
    const grandTotal     = taxableAmount + gstAmount;

    AppState.currentQuotation.discountPercent = discountPercent;
    AppState.currentQuotation.gstRate         = gstRate;

    setTextContent('q-subtotal',        formatCurrency(subtotal));
    setTextContent('q-discount-amount', formatCurrency(discountAmount));
    setTextContent('q-taxable',         formatCurrency(taxableAmount));
    setTextContent('q-gst-amount',      formatCurrency(gstAmount));
    setTextContent('q-grand-total',     formatCurrency(grandTotal));

    updatePreview();
  }

  // ── 7.4  Live preview ────────────────────────────────────────────

  function updatePreview() {
    const container = document.getElementById('quotation-preview');
    if (!container) return;

    const q        = AppState.currentQuotation;
    const settings = AppState.settings;
    const items    = q.items;

    // Read current field values
    const customer = {
      name:            getFieldValue('q-customer-name'),
      phone:           getFieldValue('q-customer-phone'),
      email:           getFieldValue('q-customer-email'),
      address:         getFieldValue('q-customer-address'),
      gst:             getFieldValue('q-customer-gst'),
      projectLocation: getFieldValue('q-customer-project'),
    };

    const quotationNumber = getFieldValue('q-number') || q.quotationNumber;
    const date            = getFieldValue('q-date')   || q.date;
    const notes           = getFieldValue('q-notes')  || '';

    // Check if we have enough data to show preview
    const hasData = customer.name || customer.phone || items.length > 0;

    if (!hasData) {
      container.innerHTML = `
        <div class="preview-placeholder">
          <svg width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
          </svg>
          <span>Fill in the details to see a live preview</span>
        </div>
      `;
      return;
    }

    // Calculate totals for preview
    const subtotal        = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const discountPercent = parseFloat(getFieldValue('q-discount-percent')) || 0;
    const discountAmount  = subtotal * discountPercent / 100;
    const taxableAmount   = subtotal - discountAmount;
    const gstRate         = parseFloat(getFieldValue('q-gst-rate')) || 0;
    const gstAmount       = taxableAmount * gstRate / 100;
    const grandTotal      = taxableAmount + gstAmount;
    const amountWords     = numberToWords(grandTotal);

    // Build header
    let headerHTML = '<div class="preview-header">';
    if (settings.logo) {
      headerHTML += `<img class="preview-logo" src="${settings.logo}" alt="Logo" />`;
    }
    headerHTML += `
      <div class="preview-header-text">
        <div class="preview-company-name">${escapeHtml(settings.companyName || 'Your Company Name')}</div>
        <div class="preview-company-details">
          ${settings.address ? escapeHtml(settings.address) + '<br>' : ''}
          ${settings.phone ? escapeHtml(settings.phone) : ''}${settings.phone && settings.email ? ' | ' : ''}${settings.email ? escapeHtml(settings.email) : ''}
          ${settings.gst ? '<br>GSTIN: ' + escapeHtml(settings.gst) : ''}
        </div>
      </div>
    </div>`;

    // Quotation title
    let titleHTML = '<div class="preview-title">QUOTATION</div>';

    // Meta
    let metaHTML = `
      <div class="preview-meta">
        <div><strong>Quotation No:</strong> ${escapeHtml(quotationNumber)}</div>
        <div><strong>Date:</strong> ${formatDate(date)}</div>
      </div>
    `;

    // Customer
    let customerHTML = '<div class="preview-customer"><h4>Bill To</h4>';
    if (customer.name) customerHTML += `<div><strong>${escapeHtml(customer.name)}</strong></div>`;
    const contactLine = [customer.phone, customer.email].filter(Boolean).join(' | ');
    if (contactLine) customerHTML += `<div>${escapeHtml(contactLine)}</div>`;
    if (customer.address) customerHTML += `<div>${escapeHtml(customer.address)}</div>`;
    if (customer.gst) customerHTML += `<div>GSTIN: ${escapeHtml(customer.gst)}</div>`;
    if (customer.projectLocation) customerHTML += `<div>Project: ${escapeHtml(customer.projectLocation)}</div>`;
    customerHTML += '</div>';

    // Items table
    let tableHTML = '';
    if (items.length > 0) {
      tableHTML = `
        <table class="preview-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (item, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.description || '')}</td>
                <td>${item.qty}</td>
                <td>${escapeHtml(item.unit)}</td>
                <td class="text-right">${formatCurrency(item.rate)}</td>
                <td class="text-right">${formatCurrency(item.amount)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    }

    // Totals
    let totalsHTML = '<div class="preview-totals">';
    totalsHTML += `<div class="total-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>`;
    if (discountPercent > 0) {
      totalsHTML += `<div class="total-row"><span>Discount (${discountPercent}%)</span><span>- ${formatCurrency(discountAmount)}</span></div>`;
      totalsHTML += `<div class="total-row"><span>Taxable Amount</span><span>${formatCurrency(taxableAmount)}</span></div>`;
    }
    if (gstRate > 0) {
      totalsHTML += `<div class="total-row"><span>GST (${gstRate}%)</span><span>+ ${formatCurrency(gstAmount)}</span></div>`;
    }
    totalsHTML += `<div class="total-row grand"><span>Grand Total</span><span>${formatCurrency(grandTotal)}</span></div>`;
    totalsHTML += '</div>';

    // Amount in words
    let wordsHTML = `<div class="preview-words">${escapeHtml(amountWords)}</div>`;

    // Notes
    let notesHTML = '';
    if (notes.trim()) {
      notesHTML = `<div class="preview-notes"><strong>Notes:</strong> ${escapeHtml(notes)}</div>`;
    }

    // Terms
    let termsHTML = '';
    const termsText = settings.terms || '';
    if (termsText.trim()) {
      const termsLines = termsText.split('\n').filter((l) => l.trim());
      // Remove leading numbering if present (e.g. "1. ", "2. ")
      const termsListItems = termsLines
        .map((line) => {
          const cleaned = line.replace(/^\d+\.\s*/, '').trim();
          return `<li>${escapeHtml(cleaned)}</li>`;
        })
        .join('');
      termsHTML = `
        <div class="preview-terms">
          <h4>Terms &amp; Conditions</h4>
          <ol>${termsListItems}</ol>
        </div>
      `;
    }

    // Footer / Signatures
    let footerHTML = `
      <div class="preview-footer">
        <div class="preview-signature">
          <div class="line"></div>
          <div class="label">Customer Signature</div>
        </div>
        <div class="preview-signature">
          <div class="line"></div>
          <div class="label">For ${escapeHtml(settings.companyName || 'Your Company')}</div>
        </div>
      </div>
    `;

    container.innerHTML =
      headerHTML +
      titleHTML +
      metaHTML +
      customerHTML +
      tableHTML +
      totalsHTML +
      wordsHTML +
      notesHTML +
      termsHTML +
      footerHTML;
  }

  /**
   * Generate preview HTML for a stored quotation object (for view modal / PDF).
   */
  function generatePreviewHTML(q) {
    const settings = AppState.settings;
    const items    = q.items || [];

    const subtotal        = q.subtotal || items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
    const discountPercent = q.discountPercent || 0;
    const discountAmount  = q.discountAmount || subtotal * discountPercent / 100;
    const taxableAmount   = q.taxableAmount || subtotal - discountAmount;
    const gstRate         = q.gstRate || 0;
    const gstAmount       = q.gstAmount || taxableAmount * gstRate / 100;
    const grandTotal      = q.grandTotal || taxableAmount + gstAmount;
    const amountWords     = q.amountInWords || numberToWords(grandTotal);
    const customer        = q.customer || {};

    let headerHTML = '<div class="preview-header">';
    if (settings.logo) {
      headerHTML += `<img class="preview-logo" src="${settings.logo}" alt="Logo" />`;
    }
    headerHTML += `
      <div class="preview-header-text">
        <div class="preview-company-name">${escapeHtml(settings.companyName || 'Your Company Name')}</div>
        <div class="preview-company-details">
          ${settings.address ? escapeHtml(settings.address) + '<br>' : ''}
          ${settings.phone ? escapeHtml(settings.phone) : ''}${settings.phone && settings.email ? ' | ' : ''}${settings.email ? escapeHtml(settings.email) : ''}
          ${settings.gst ? '<br>GSTIN: ' + escapeHtml(settings.gst) : ''}
        </div>
      </div>
    </div>`;

    let titleHTML = '<div class="preview-title">QUOTATION</div>';

    let metaHTML = `
      <div class="preview-meta">
        <div><strong>Quotation No:</strong> ${escapeHtml(q.quotationNumber || '')}</div>
        <div><strong>Date:</strong> ${formatDate(q.date)}</div>
      </div>
    `;

    let customerHTML = '<div class="preview-customer"><h4>Bill To</h4>';
    if (customer.name) customerHTML += `<div><strong>${escapeHtml(customer.name)}</strong></div>`;
    const contactLine = [customer.phone, customer.email].filter(Boolean).join(' | ');
    if (contactLine) customerHTML += `<div>${escapeHtml(contactLine)}</div>`;
    if (customer.address) customerHTML += `<div>${escapeHtml(customer.address)}</div>`;
    if (customer.gst) customerHTML += `<div>GSTIN: ${escapeHtml(customer.gst)}</div>`;
    if (customer.projectLocation) customerHTML += `<div>Project: ${escapeHtml(customer.projectLocation)}</div>`;
    customerHTML += '</div>';

    let tableHTML = '';
    if (items.length > 0) {
      tableHTML = `
        <table class="preview-table">
          <thead><tr><th>#</th><th>Item</th><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>
          <tbody>
            ${items
              .map(
                (item, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.description || '')}</td>
                <td>${item.qty}</td>
                <td>${escapeHtml(item.unit)}</td>
                <td class="text-right">${formatCurrency(item.rate)}</td>
                <td class="text-right">${formatCurrency(item.amount)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      `;
    }

    let totalsHTML = '<div class="preview-totals">';
    totalsHTML += `<div class="total-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>`;
    if (discountPercent > 0) {
      totalsHTML += `<div class="total-row"><span>Discount (${discountPercent}%)</span><span>- ${formatCurrency(discountAmount)}</span></div>`;
      totalsHTML += `<div class="total-row"><span>Taxable Amount</span><span>${formatCurrency(taxableAmount)}</span></div>`;
    }
    if (gstRate > 0) {
      totalsHTML += `<div class="total-row"><span>GST (${gstRate}%)</span><span>+ ${formatCurrency(gstAmount)}</span></div>`;
    }
    totalsHTML += `<div class="total-row grand"><span>Grand Total</span><span>${formatCurrency(grandTotal)}</span></div>`;
    totalsHTML += '</div>';

    let wordsHTML = `<div class="preview-words">${escapeHtml(amountWords)}</div>`;

    let notesHTML = '';
    if (q.notes && q.notes.trim()) {
      notesHTML = `<div class="preview-notes"><strong>Notes:</strong> ${escapeHtml(q.notes)}</div>`;
    }

    let termsHTML = '';
    const termsText = settings.terms || '';
    if (termsText.trim()) {
      const termsLines = termsText.split('\n').filter((l) => l.trim());
      const termsListItems = termsLines
        .map((line) => `<li>${escapeHtml(line.replace(/^\d+\.\s*/, '').trim())}</li>`)
        .join('');
      termsHTML = `<div class="preview-terms"><h4>Terms &amp; Conditions</h4><ol>${termsListItems}</ol></div>`;
    }

    let footerHTML = `
      <div class="preview-footer">
        <div class="preview-signature"><div class="line"></div><div class="label">Customer Signature</div></div>
        <div class="preview-signature"><div class="line"></div><div class="label">For ${escapeHtml(settings.companyName || 'Your Company')}</div></div>
      </div>
    `;

    return headerHTML + titleHTML + metaHTML + customerHTML + tableHTML + totalsHTML + wordsHTML + notesHTML + termsHTML + footerHTML;
  }

  // ── 7.5  Save quotation ──────────────────────────────────────────

  function buildCurrentQuotation() {
    const items = AppState.currentQuotation.items;

    const subtotal        = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const discountPercent = parseFloat(getFieldValue('q-discount-percent')) || 0;
    const discountAmount  = subtotal * discountPercent / 100;
    const taxableAmount   = subtotal - discountAmount;
    const gstRate         = parseFloat(getFieldValue('q-gst-rate')) || 0;
    const gstAmount       = taxableAmount * gstRate / 100;
    const grandTotal      = taxableAmount + gstAmount;

    return {
      id:              AppState.currentQuotation.id || undefined,
      quotationNumber: getFieldValue('q-number')    || AppState.currentQuotation.quotationNumber,
      date:            getFieldValue('q-date')       || AppState.currentQuotation.date,
      customer: {
        name:            getFieldValue('q-customer-name'),
        phone:           getFieldValue('q-customer-phone'),
        email:           getFieldValue('q-customer-email'),
        address:         getFieldValue('q-customer-address'),
        gst:             getFieldValue('q-customer-gst'),
        projectLocation: getFieldValue('q-customer-project'),
      },
      items:           JSON.parse(JSON.stringify(items)),
      subtotal,
      discountPercent,
      discountAmount,
      taxableAmount,
      gstRate,
      gstAmount,
      grandTotal,
      amountInWords:   numberToWords(grandTotal),
      notes:           getFieldValue('q-notes') || '',
      status:          'draft',
      createdAt:       AppState.currentQuotation.createdAt || new Date().toISOString(),
    };
  }

  async function saveQuotation(status) {
    const customerName  = (getFieldValue('q-customer-name') || '').trim();
    const customerPhone = (getFieldValue('q-customer-phone') || '').trim();
    const items         = AppState.currentQuotation.items;

    if (!customerName) {
      showToast('Customer name is required', 'error');
      return;
    }
    if (!customerPhone) {
      showToast('Customer phone is required', 'error');
      return;
    }
    if (items.length === 0) {
      showToast('Add at least one item to the quotation', 'error');
      return;
    }

    const quotation   = buildCurrentQuotation();
    quotation.status  = status;

    try {
      if (quotation.id) {
        await DB.updateQuotation(quotation);
        showToast('Quotation updated successfully', 'success');
      } else {
        delete quotation.id; // ensure no undefined id
        const newId = await DB.addQuotation(quotation);
        AppState.currentQuotation.id = newId;
        quotation.id = newId;
        showToast('Quotation saved successfully', 'success');
      }

      if (status === 'final') {
        showConfirm(
          'Export PDF?',
          'Quotation finalized! Would you like to export it as PDF now?',
          () => generatePDF(quotation)
        );
      }
    } catch (err) {
      console.error('Save quotation error:', err);
      showToast('Failed to save quotation', 'error');
    }
  }

  async function clearQuotation() {
    // Reset state
    AppState.currentQuotation = {
      id: null,
      quotationNumber: '',
      date: new Date().toISOString().split('T')[0],
      customer: { name: '', phone: '', email: '', address: '', gst: '', projectLocation: '' },
      items: [],
      discountPercent: 0,
      gstRate: 18,
      notes: '',
      status: 'draft',
    };

    // Clear form fields
    const fields = [
      'q-customer-name', 'q-customer-phone', 'q-customer-email',
      'q-customer-address', 'q-customer-gst', 'q-customer-project', 'q-notes',
    ];
    fields.forEach((id) => setFieldValue(id, ''));

    setFieldValue('q-discount-percent', '0');
    setFieldValue('q-gst-rate', '18');
    setFieldValue('q-date', new Date().toISOString().split('T')[0]);

    // Generate new quotation number
    try {
      const nextNum = await DB.getNextQuotationNumber();
      setFieldValue('q-number', nextNum);
      AppState.currentQuotation.quotationNumber = nextNum;
    } catch (err) {
      console.error('Failed to generate quotation number:', err);
    }

    renderQuotationItems();
    recalculate();
    showToast('Quotation cleared', 'info');
  }

  // ── 7.6  Load quotation into builder (for edit / duplicate) ──────

  function loadQuotationIntoBuilder(q) {
    AppState.currentQuotation = {
      id:              q.id || null,
      quotationNumber: q.quotationNumber || '',
      date:            q.date || new Date().toISOString().split('T')[0],
      customer:        q.customer ? { ...q.customer } : { name: '', phone: '', email: '', address: '', gst: '', projectLocation: '' },
      items:           q.items ? JSON.parse(JSON.stringify(q.items)) : [],
      discountPercent: q.discountPercent || 0,
      gstRate:         q.gstRate || 18,
      notes:           q.notes || '',
      status:          q.status || 'draft',
      createdAt:       q.createdAt,
    };

    // Set form fields
    setFieldValue('q-number',           q.quotationNumber || '');
    setFieldValue('q-date',             q.date || '');
    setFieldValue('q-customer-name',    q.customer ? q.customer.name : '');
    setFieldValue('q-customer-phone',   q.customer ? q.customer.phone : '');
    setFieldValue('q-customer-email',   q.customer ? q.customer.email : '');
    setFieldValue('q-customer-address', q.customer ? q.customer.address : '');
    setFieldValue('q-customer-gst',     q.customer ? q.customer.gst : '');
    setFieldValue('q-customer-project', q.customer ? q.customer.projectLocation : '');
    setFieldValue('q-discount-percent', q.discountPercent || 0);
    setFieldValue('q-gst-rate',         q.gstRate || 18);
    setFieldValue('q-notes',            q.notes || '');

    renderQuotationItems();
    recalculate();
  }

  /* ================================================================
   *  §8  QUOTATION HISTORY
   * ============================================================== */

  async function loadHistory() {
    try {
      const quotations = await DB.getAllQuotations();
      renderHistoryTable(quotations);
    } catch (err) {
      console.error('Load history error:', err);
      showToast('Failed to load history', 'error');
    }
  }

  function renderHistoryTable(quotations) {
    const tbody = document.getElementById('history-tbody');
    const empty = document.getElementById('history-empty');
    if (!tbody) return;

    if (!quotations || quotations.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }

    if (empty) empty.style.display = 'none';

    tbody.innerHTML = quotations
      .map(
        (q, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><span class="quotation-number">${escapeHtml(q.quotationNumber)}</span></td>
        <td>${escapeHtml(q.customer ? q.customer.name : '')}</td>
        <td>${formatDate(q.date)}</td>
        <td class="text-right">${formatCurrency(q.grandTotal)}</td>
        <td><span class="badge badge-${q.status === 'final' ? 'success' : 'warning'}">${q.status === 'final' ? 'Final' : 'Draft'}</span></td>
        <td class="actions-cell">
          <button class="btn-icon" title="View" data-action="view-quotation" data-id="${q.id}">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          </button>
          <button class="btn-icon" title="Export PDF" data-action="pdf-quotation" data-id="${q.id}">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </button>
          <button class="btn-icon" title="Duplicate" data-action="duplicate-quotation" data-id="${q.id}">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>
          <button class="btn-icon btn-delete" title="Delete" data-action="delete-quotation" data-id="${q.id}">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </td>
      </tr>
    `
      )
      .join('');
  }

  async function searchHistory() {
    const query    = getFieldValue('history-search') || '';
    const dateFrom = getFieldValue('history-date-from') || '';
    const dateTo   = getFieldValue('history-date-to') || '';

    try {
      const results = await DB.searchQuotations(query, dateFrom, dateTo);
      renderHistoryTable(results);
    } catch (err) {
      console.error('Search history error:', err);
    }
  }

  async function viewQuotation(id) {
    try {
      const q = await DB.getQuotation(id);
      if (!q) {
        showToast('Quotation not found', 'error');
        return;
      }

      AppState.viewingQuotationId = id;

      const content = document.getElementById('view-quotation-content');
      if (content) {
        content.innerHTML = generatePreviewHTML(q);
      }

      const modal = document.getElementById('view-quotation-modal');
      if (modal) modal.classList.add('active');
    } catch (err) {
      console.error('View quotation error:', err);
      showToast('Failed to load quotation', 'error');
    }
  }

  async function duplicateQuotation(id) {
    try {
      const q = await DB.getQuotation(id);
      if (!q) {
        showToast('Quotation not found', 'error');
        return;
      }

      // Generate new number
      const newNumber = await DB.getNextQuotationNumber();

      // Copy quotation data but clear id and set new number
      const duplicated = {
        ...q,
        id: null,
        quotationNumber: newNumber,
        date: new Date().toISOString().split('T')[0],
        status: 'draft',
        createdAt: undefined,
      };

      loadQuotationIntoBuilder(duplicated);

      // Close view modal if open
      closeViewQuotationModal();

      navigateTo('new-quotation');
      showToast('Quotation duplicated – edit and save as new', 'info');
    } catch (err) {
      console.error('Duplicate quotation error:', err);
      showToast('Failed to duplicate quotation', 'error');
    }
  }

  function deleteQuotation(id) {
    showConfirm('Delete Quotation', 'Are you sure you want to delete this quotation? This action cannot be undone.', async () => {
      try {
        await DB.deleteQuotation(id);
        showToast('Quotation deleted', 'success');
        await loadHistory();
      } catch (err) {
        console.error('Delete quotation error:', err);
        showToast('Failed to delete quotation', 'error');
      }
    });
  }

  async function editQuotationFromModal() {
    if (!AppState.viewingQuotationId) return;

    try {
      const q = await DB.getQuotation(AppState.viewingQuotationId);
      if (!q) {
        showToast('Quotation not found', 'error');
        return;
      }

      loadQuotationIntoBuilder(q);
      closeViewQuotationModal();
      navigateTo('new-quotation');
      showToast('Editing quotation – make changes and save', 'info');
    } catch (err) {
      console.error('Edit quotation error:', err);
      showToast('Failed to load quotation for editing', 'error');
    }
  }

  function closeViewQuotationModal() {
    const modal = document.getElementById('view-quotation-modal');
    if (modal) modal.classList.remove('active');
    AppState.viewingQuotationId = null;
  }

  /* ================================================================
   *  §9  PDF GENERATION
   * ============================================================== */

  async function generatePDF(quotationData = null) {
    let q;
    if (quotationData) {
      q = quotationData;
    } else {
      q = buildCurrentQuotation();
    }

    const settings = AppState.settings;

    // Safety check
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast('PDF library not loaded. Please check your internet connection.', 'error');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    const pageWidth  = doc.internal.pageSize.getWidth();  // 210
    const pageHeight = doc.internal.pageSize.getHeight(); // 297
    const margin     = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = 15;

    // ── Colors ──
    const indigo     = [99, 102, 241];
    const darkText   = [31, 41, 55];
    const grayText   = [107, 114, 128];
    const lightGray  = [243, 244, 246];

    // ── Company Logo ──
    if (settings.logo) {
      try {
        doc.addImage(settings.logo, 'PNG', margin, y, 20, 20);
        // Company name to the right of logo
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkText);
        doc.text(settings.companyName || 'Your Company Name', margin + 25, y + 7);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayText);
        let detailY = y + 12;
        if (settings.address) {
          doc.text(settings.address, margin + 25, detailY);
          detailY += 4;
        }
        const contact = [settings.phone, settings.email].filter(Boolean).join(' | ');
        if (contact) {
          doc.text(contact, margin + 25, detailY);
          detailY += 4;
        }
        if (settings.gst) {
          doc.text('GSTIN: ' + settings.gst, margin + 25, detailY);
          detailY += 4;
        }
        y = Math.max(y + 23, detailY + 2);
      } catch (e) {
        console.warn('Failed to add logo to PDF:', e);
        // Fall through to no-logo header
        y = renderPDFHeaderNoLogo(doc, settings, margin, y, darkText, grayText);
      }
    } else {
      y = renderPDFHeaderNoLogo(doc, settings, margin, y, darkText, grayText);
    }

    // ── Divider ──
    y += 2;
    doc.setDrawColor(...indigo);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // ── QUOTATION Title ──
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...indigo);
    doc.text('QUOTATION', pageWidth / 2, y, { align: 'center' });
    y += 8;

    // ── Meta info ──
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkText);
    doc.text(`Quotation No: ${q.quotationNumber || ''}`, margin, y);
    doc.text(`Date: ${formatDate(q.date)}`, pageWidth - margin, y, { align: 'right' });
    y += 8;

    // ── Bill To ──
    const customer = q.customer || {};

    // Background box
    doc.setFillColor(...lightGray);
    doc.roundedRect(margin, y - 1, contentWidth, 28, 2, 2, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...indigo);
    doc.text('Bill To', margin + 4, y + 4);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkText);
    doc.text(customer.name || '', margin + 4, y + 10);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayText);
    let cy = y + 15;

    const custContact = [customer.phone, customer.email].filter(Boolean).join(' | ');
    if (custContact) {
      doc.text(custContact, margin + 4, cy);
      cy += 4;
    }
    if (customer.address) {
      doc.text(customer.address, margin + 4, cy);
      cy += 4;
    }

    // Right side details
    let rightY = y + 10;
    if (customer.gst) {
      doc.text('GSTIN: ' + customer.gst, pageWidth - margin - 4, rightY, { align: 'right' });
      rightY += 4;
    }
    if (customer.projectLocation) {
      doc.text('Project: ' + customer.projectLocation, pageWidth - margin - 4, rightY, { align: 'right' });
    }

    y += 32;

    // ── Items Table ──
    const tableBody = (q.items || []).map((item, i) => [
      i + 1,
      item.name || '',
      truncate(item.description || '', 40),
      item.qty,
      item.unit || '',
      formatCurrencyPlain(item.rate),
      formatCurrencyPlain(item.amount),
    ]);

    doc.autoTable({
      startY: y,
      head: [['#', 'Item', 'Description', 'Qty', 'Unit', 'Rate', 'Amount']],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: indigo,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 9,
        textColor: darkText,
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 35 },
        2: { cellWidth: 'auto' },
        3: { halign: 'center', cellWidth: 15 },
        4: { halign: 'center', cellWidth: 15 },
        5: { halign: 'right', cellWidth: 25 },
        6: { halign: 'right', cellWidth: 28 },
      },
      margin: { left: margin, right: margin },
      styles: {
        lineColor: [229, 231, 235],
        lineWidth: 0.3,
      },
    });

    y = doc.lastAutoTable.finalY + 4;

    // ── Totals (simple manual drawing — no autoTable) ──
    const pdfCurrency = 'Rs.';
    function formatForPDF(amount) {
      return pdfCurrency + formatCurrencyPlain(amount);
    }

    const subtotal        = q.subtotal || 0;
    const discountPercent = q.discountPercent || 0;
    const discountAmount  = q.discountAmount || 0;
    const taxableAmount   = q.taxableAmount || subtotal;
    const gstRate         = q.gstRate || 0;
    const gstAmount       = q.gstAmount || 0;
    const grandTotal      = q.grandTotal || 0;

    // Totals block: right-aligned, spanning right half of content area
    const totRight = pageWidth - margin;        // right edge (same as table)
    const totLeft  = pageWidth - margin - 90;   // left edge of totals block
    const rowH     = 7;                         // row height

    function drawTotalsRow(label, value) {
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...grayText);
      doc.text(label, totLeft, y);
      doc.setTextColor(...darkText);
      doc.text(value, totRight, y, { align: 'right' });
      y += rowH;
    }

    drawTotalsRow('Subtotal', formatForPDF(subtotal));

    if (discountPercent > 0) {
      drawTotalsRow('Discount (' + discountPercent + '%)', '- ' + formatForPDF(discountAmount));
      drawTotalsRow('Taxable Amount', formatForPDF(taxableAmount));
    }

    if (gstRate > 0) {
      drawTotalsRow('GST (' + gstRate + '%)', '+ ' + formatForPDF(gstAmount));
    }

    // Separator line above Grand Total
    doc.setDrawColor(50, 50, 70);
    doc.setLineWidth(0.5);
    doc.line(totLeft, y - 2, totRight, y - 2);
    y += 3;

    // Grand Total row — bold
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkText);
    doc.text('Grand Total', totLeft, y);
    doc.text(formatForPDF(grandTotal), totRight, y, { align: 'right' });
    y += 2;

    // Bottom accent line under Grand Total
    doc.setDrawColor(...indigo);
    doc.setLineWidth(0.8);
    doc.line(totLeft, y, totRight, y);
    y += 8;

    // ── Amount in words ──
    doc.setTextColor(...grayText);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    const amountWords = q.amountInWords || numberToWords(grandTotal);
    const splitWords  = doc.splitTextToSize(amountWords, contentWidth);
    doc.text(splitWords, margin, y);
    y += splitWords.length * 4 + 4;

    // ── Notes ──
    if (q.notes && q.notes.trim()) {
      // Check page space
      if (y > pageHeight - 60) {
        doc.addPage();
        y = 15;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkText);
      doc.text('Notes', margin, y);
      y += 5;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...grayText);
      const splitNotes = doc.splitTextToSize(q.notes, contentWidth);
      doc.text(splitNotes, margin, y);
      y += splitNotes.length * 4 + 4;
    }

    // ── Terms & Conditions ──
    const termsText = settings.terms || '';
    if (termsText.trim()) {
      if (y > pageHeight - 50) {
        doc.addPage();
        y = 15;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkText);
      doc.text('Terms & Conditions', margin, y);
      y += 5;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...grayText);

      const termsLines = termsText.split('\n').filter((l) => l.trim());
      termsLines.forEach((line, i) => {
        if (y > pageHeight - 25) {
          doc.addPage();
          y = 15;
        }
        const cleaned = line.replace(/^\d+\.\s*/, '').trim();
        doc.text(`${i + 1}. ${cleaned}`, margin + 2, y);
        y += 4;
      });

      y += 4;
    }

    // ── Signature section ──
    if (y > pageHeight - 35) {
      doc.addPage();
      y = 15;
    }

    const sigY = Math.max(y + 10, pageHeight - 35);

    doc.setDrawColor(...grayText);
    doc.setLineWidth(0.3);

    // Customer signature
    doc.line(margin, sigY, margin + 55, sigY);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayText);
    doc.text('Customer Signature', margin, sigY + 5);

    // Company signature
    const rightSigX = pageWidth - margin - 55;
    doc.line(rightSigX, sigY, pageWidth - margin, sigY);
    doc.text(`For ${settings.companyName || 'Your Company'}`, rightSigX, sigY + 5);

    // ── Save ──
    const safeName = (q.customer && q.customer.name ? q.customer.name : 'Customer').replace(/[^a-zA-Z0-9]/g, '-');
    const fileName = `${q.quotationNumber || 'Quotation'}_${safeName}.pdf`;
    doc.save(fileName);

    showToast('PDF exported successfully!', 'success');
  }

  /**
   * Render company header in PDF when no logo is present.
   */
  function renderPDFHeaderNoLogo(doc, settings, margin, y, darkText, grayText) {
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkText);
    doc.text(settings.companyName || 'Your Company Name', margin, y + 7);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayText);
    let detailY = y + 13;
    if (settings.address) {
      doc.text(settings.address, margin, detailY);
      detailY += 4;
    }
    const contact = [settings.phone, settings.email].filter(Boolean).join(' | ');
    if (contact) {
      doc.text(contact, margin, detailY);
      detailY += 4;
    }
    if (settings.gst) {
      doc.text('GSTIN: ' + settings.gst, margin, detailY);
      detailY += 4;
    }

    return detailY + 2;
  }

  async function exportPDFFromModal() {
    if (!AppState.viewingQuotationId) return;
    try {
      const q = await DB.getQuotation(AppState.viewingQuotationId);
      if (q) await generatePDF(q);
    } catch (err) {
      console.error('Export PDF from modal error:', err);
      showToast('Failed to export PDF', 'error');
    }
  }

  async function exportPDFById(id) {
    try {
      const q = await DB.getQuotation(id);
      if (q) await generatePDF(q);
    } catch (err) {
      console.error('Export PDF error:', err);
      showToast('Failed to export PDF', 'error');
    }
  }

  /* ================================================================
   *  §10  FIELD HELPERS
   * ============================================================== */

  function getFieldValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  function setFieldValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  function setTextContent(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  /* ================================================================
   *  §11  EVENT LISTENERS
   * ============================================================== */

  function bindEventListeners() {

    // ── 11.1  Navigation ──
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view || item.getAttribute('data-view');
        if (view) navigateTo(view);
      });
    });

    // ── 11.2  Sidebar toggle ──
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar       = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }

    // ── 11.3  Products ──
    const btnAddProduct = document.getElementById('btn-add-product');
    if (btnAddProduct) {
      btnAddProduct.addEventListener('click', () => openProductModal());
    }

    const btnSaveProduct = document.getElementById('btn-save-product');
    if (btnSaveProduct) {
      btnSaveProduct.addEventListener('click', (e) => {
        e.preventDefault();
        saveProduct();
      });
    }

    const btnCancelProduct = document.getElementById('btn-cancel-product');
    if (btnCancelProduct) {
      btnCancelProduct.addEventListener('click', () => closeProductModal());
    }

    const productSearch = document.getElementById('product-search');
    if (productSearch) {
      productSearch.addEventListener(
        'input',
        debounce(async () => {
          const query = productSearch.value.trim();
          try {
            const products = query
              ? await DB.searchProducts(query)
              : await DB.getAllProducts();
            renderProductsTable(products);
          } catch (err) {
            console.error('Product search error:', err);
          }
        }, 300)
      );
    }

    // Products table delegation (edit + delete)
    const productsTbody = document.getElementById('products-tbody');
    if (productsTbody) {
      productsTbody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id     = parseInt(btn.dataset.id, 10);
        if (action === 'edit-product')   openProductModal(id);
        if (action === 'delete-product') deleteProduct(id);
      });
    }

    // ── 11.4  Settings ──
    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', (e) => {
        e.preventDefault();
        saveSettings();
      });
    }

    const logoInput = document.getElementById('s-logo-input');
    if (logoInput) {
      logoInput.addEventListener('change', handleLogoUpload);
    }

    const btnClearLogo = document.getElementById('btn-clear-logo');
    if (btnClearLogo) {
      btnClearLogo.addEventListener('click', clearLogo);
    }

    // ── 11.5  Quotation builder ──

    // Item search
    const qItemSearch = document.getElementById('q-item-search');
    if (qItemSearch) {
      qItemSearch.addEventListener('input', handleItemSearch);
    }

    // Item results click delegation
    const qItemResults = document.getElementById('q-item-results');
    if (qItemResults) {
      qItemResults.addEventListener('click', (e) => {
        const item = e.target.closest('.search-result-item');
        if (!item || item.classList.contains('no-result')) return;
        const productId = parseInt(item.dataset.productId, 10);
        if (productId) addItemFromSearch(productId);
      });
    }

    // Items table delegation (qty, rate change + delete)
    const qItemsTbody = document.getElementById('q-items-tbody');
    if (qItemsTbody) {
      // Change events for qty and rate inputs
      qItemsTbody.addEventListener('input', (e) => {
        const target = e.target;
        const index  = parseInt(target.dataset.index, 10);
        if (isNaN(index)) return;

        const item = AppState.currentQuotation.items[index];
        if (!item) return;

        if (target.classList.contains('item-qty')) {
          item.qty    = parseFloat(target.value) || 1;
          item.amount = item.qty * item.rate;
          // Update amount cell
          const row = target.closest('tr');
          if (row) {
            const amountCell = row.querySelector('.item-amount');
            if (amountCell) amountCell.textContent = formatCurrency(item.amount);
          }
          recalculate();
        }

        if (target.classList.contains('item-rate')) {
          item.rate   = parseFloat(target.value) || 0;
          item.amount = item.qty * item.rate;
          const row = target.closest('tr');
          if (row) {
            const amountCell = row.querySelector('.item-amount');
            if (amountCell) amountCell.textContent = formatCurrency(item.amount);
          }
          recalculate();
        }
      });

      // Delete button
      qItemsTbody.addEventListener('click', (e) => {
        const btn = e.target.closest('.item-remove');
        if (!btn) return;
        const index = parseInt(btn.dataset.index, 10);
        if (isNaN(index)) return;

        AppState.currentQuotation.items.splice(index, 1);
        renderQuotationItems();
        recalculate();
      });
    }

    // Discount & GST
    const qDiscountPercent = document.getElementById('q-discount-percent');
    if (qDiscountPercent) {
      qDiscountPercent.addEventListener('input', () => recalculate());
    }

    const qGstRate = document.getElementById('q-gst-rate');
    if (qGstRate) {
      qGstRate.addEventListener('input', () => recalculate());
    }

    // Notes
    const qNotes = document.getElementById('q-notes');
    if (qNotes) {
      qNotes.addEventListener('input', () => updatePreview());
    }

    // Customer fields → update preview
    const customerFields = [
      'q-customer-name', 'q-customer-phone', 'q-customer-email',
      'q-customer-address', 'q-customer-gst', 'q-customer-project',
    ];
    customerFields.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => updatePreview());
      }
    });

    // Date field
    const qDate = document.getElementById('q-date');
    if (qDate) {
      qDate.addEventListener('change', () => updatePreview());
    }

    // Save / Finalize / Export / Clear
    const btnSaveDraft = document.getElementById('btn-save-draft');
    if (btnSaveDraft) {
      btnSaveDraft.addEventListener('click', () => saveQuotation('draft'));
    }

    const btnFinalize = document.getElementById('btn-finalize');
    if (btnFinalize) {
      btnFinalize.addEventListener('click', () => saveQuotation('final'));
    }

    const btnExportPdf = document.getElementById('btn-export-pdf');
    if (btnExportPdf) {
      btnExportPdf.addEventListener('click', async () => {
        // Save first, then export
        const customerName = (getFieldValue('q-customer-name') || '').trim();
        const items        = AppState.currentQuotation.items;
        if (customerName && items.length > 0) {
          await saveQuotation(AppState.currentQuotation.status || 'draft');
        }
        await generatePDF();
      });
    }

    const btnClearQuotation = document.getElementById('btn-clear-quotation');
    if (btnClearQuotation) {
      btnClearQuotation.addEventListener('click', () => {
        showConfirm('Clear Quotation', 'Are you sure you want to clear all fields and start a new quotation?', clearQuotation);
      });
    }

    // ── 11.6  History ──
    const btnSearchHistory = document.getElementById('btn-search-history');
    if (btnSearchHistory) {
      btnSearchHistory.addEventListener('click', () => searchHistory());
    }

    const historySearch = document.getElementById('history-search');
    if (historySearch) {
      historySearch.addEventListener(
        'input',
        debounce(() => searchHistory(), 300)
      );
    }

    // History table delegation
    const historyTbody = document.getElementById('history-tbody');
    if (historyTbody) {
      historyTbody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id     = parseInt(btn.dataset.id, 10);
        switch (action) {
          case 'view-quotation':      viewQuotation(id);      break;
          case 'pdf-quotation':       exportPDFById(id);      break;
          case 'duplicate-quotation': duplicateQuotation(id);  break;
          case 'delete-quotation':    deleteQuotation(id);     break;
        }
      });
    }

    // Dashboard table delegation
    const recentBody = document.getElementById('recent-quotations-body');
    if (recentBody) {
      recentBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id     = parseInt(btn.dataset.id, 10);
        if (action === 'view-quotation') viewQuotation(id);
        if (action === 'pdf-quotation')  exportPDFById(id);
      });
    }

    // ── 11.7  Modals ──

    // Overlay click to close
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        // Only close if clicking on overlay itself, not modal content
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
      });
    });

    // Confirm modal
    const btnConfirmYes = document.getElementById('btn-confirm-yes');
    if (btnConfirmYes) {
      btnConfirmYes.addEventListener('click', () => {
        if (AppState.confirmCallback) {
          AppState.confirmCallback();
        }
        closeConfirmModal();
      });
    }

    const btnConfirmNo = document.getElementById('btn-confirm-no');
    if (btnConfirmNo) {
      btnConfirmNo.addEventListener('click', closeConfirmModal);
    }

    // View quotation modal buttons
    const btnModalExportPdf = document.getElementById('btn-modal-export-pdf');
    if (btnModalExportPdf) {
      btnModalExportPdf.addEventListener('click', exportPDFFromModal);
    }

    const btnModalDuplicate = document.getElementById('btn-modal-duplicate');
    if (btnModalDuplicate) {
      btnModalDuplicate.addEventListener('click', () => {
        if (AppState.viewingQuotationId) duplicateQuotation(AppState.viewingQuotationId);
      });
    }

    const btnModalEdit = document.getElementById('btn-modal-edit');
    if (btnModalEdit) {
      btnModalEdit.addEventListener('click', editQuotationFromModal);
    }

    const btnModalClose = document.getElementById('btn-modal-close');
    if (btnModalClose) {
      btnModalClose.addEventListener('click', closeViewQuotationModal);
    }

    // ── 11.8  Keyboard ──
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Close any open modal
        document.querySelectorAll('.modal-overlay.active').forEach((modal) => {
          modal.classList.remove('active');
        });
        // Also close search dropdown
        const results = document.getElementById('q-item-results');
        if (results) {
          results.innerHTML = '';
          results.classList.remove('active');
        }
      }
    });

    // ── 11.9  Click outside to close search dropdown ──
    document.addEventListener('click', (e) => {
      const results    = document.getElementById('q-item-results');
      const searchInput = document.getElementById('q-item-search');
      if (results && searchInput) {
        if (!results.contains(e.target) && e.target !== searchInput) {
          results.innerHTML = '';
          results.classList.remove('active');
        }
      }
    });
  }

  /* ================================================================
   *  §12  INITIALISATION
   * ============================================================== */

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await DB.init();
      AppState.settings = await DB.getAllSettings();
      bindEventListeners();
      await loadDashboard();

      // Pre-generate quotation number for builder
      try {
        const nextNum = await DB.getNextQuotationNumber();
        const qNumEl  = document.getElementById('q-number');
        if (qNumEl) qNumEl.value = nextNum;
        AppState.currentQuotation.quotationNumber = nextNum;
      } catch (err) {
        console.error('Failed to generate quotation number:', err);
      }

      // Set today's date
      const today = new Date().toISOString().split('T')[0];
      setFieldValue('q-date', today);
      AppState.currentQuotation.date = today;

      // Set default GST rate
      setFieldValue('q-gst-rate', '18');
      setFieldValue('q-discount-percent', '0');

    } catch (err) {
      console.error('Failed to initialize:', err);
      showToast('Failed to initialize application', 'error');
    }
  });

})();
