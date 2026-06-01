// Minimal, robust frontend app script — safe DOM access and event binding.
// Robust frontend script: full auth → dashboard → contacts flow (CRUD)

(function () {
  'use strict';

  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));

  const state = {
    user: null,
    contacts: [],
    theme: localStorage.getItem('datastorer_theme') || 'dark',
    pictureFile: null,
    editingContactId: null,
    additionalImageFiles: [], // new files selected
    existingAdditionalImages: [] // existing images kept
  };

  const dom = {
    html: document.documentElement,
    themeToggle: q('#theme-toggle'),
    themeToggleIcon: q('#theme-toggle i'),
    authSection: q('#auth-section'),
    dashboardSection: q('#dashboard-section'),
    authTabsHeader: q('#auth-tabs-header'),
    authTabs: qa('.auth-tab'),
    authForms: qa('.auth-form'),
    passwordLoginForm: q('#password-login-form'),
    pinLoginForm: q('#pin-login-form'),
    biometricsLoginForm: q('#biometrics-login-form'),
    registerForm: q('#register-form'),
    loginPwUsername: q('#login-pw-username'),
    loginPwPassword: q('#login-pw-password'),
    loginPinUsername: q('#login-pin-username'),
    loginBioUsername: q('#login-bio-username'),
    regUsername: q('#reg-username'),
    regPassword: q('#reg-password'),
    regPin: q('#reg-pin'),
    userProfileWidget: q('#user-profile-widget'),
    userGreeting: q('#user-greeting'),
    logoutBtn: q('#logout-btn'),
    addContactBtn: q('#add-contact-btn'),
    contactsGrid: q('#contacts-grid'),
    noContactsView: q('#no-contacts-view'),
    statTotalContacts: q('#stat-total-contacts'),
    statMappedContacts: q('#stat-mapped-contacts'),
    contactModal: q('#contact-modal'),
    contactModalClose: q('#contact-modal-close'),
    contactModalCancel: q('#contact-modal-cancel'),
    contactForm: q('#contact-form'),
    contactEditId: q('#contact-edit-id'),
    contactName: q('#contact-name'),
    phoneList: q('#phone-list'),
    addPhoneBtn: q('#add-phone-btn'),
    contactPictureInput: q('#contact-picture-input'),
    avatarPreview: q('#avatar-preview'),
    contactEmail: q('#contact-email'),
    contactOccupation: q('#contact-occupation'),
    contactOccupationLocation: q('#contact-occupation-location'),
    contactNotes: q('#contact-notes'),
    contactLocation: q('#contact-location'),
    toastContainer: q('#toast-container'),
    searchInput: q('#search-input'),
    settingsBtn: q('#settings-btn'),
    settingsModal: q('#settings-modal'),
    settingsModalClose: q('#settings-modal-close'),
    settingsModalDone: q('#settings-modal-done'),
    pinStatusLabel: q('#pin-status-label'),
    settingsRemovePinBtn: q('#settings-remove-pin-btn'),
    settingsSetPinBtn: q('#settings-set-pin-btn'),
    settingsPinFormWrapper: q('#settings-pin-form-wrapper'),
    settingsNewPin: q('#settings-new-pin'),
    saveNewPinBtn: q('#save-new-pin-btn'),
    cancelNewPinBtn: q('#cancel-new-pin-btn'),
    bioStatusLabel: q('#bio-status-label'),
    settingsRegisterBioBtn: q('#settings-register-bio-btn'),
    loginPinValue: q('#login-pin-value'),
    pinDots: qa('.pin-dots .dot'),
    keyBtns: qa('.keypad .key-btn'),
    keyClear: q('#key-clear'),
    keyBack: q('#key-back'),
    pinSubmitBtn: q('#pin-submit-btn'),
    bioScanTrigger: q('#bio-scan-trigger'),
    bioScannerStatus: q('#bio-scanner-status'),
    additionalImagesPreviewGrid: q('#additional-images-preview-grid'),
    triggerAdditionalImagesBtn: q('#trigger-additional-images-btn'),
    additionalImagesInput: q('#additional-images-input'),
    customFieldsContainer: q('#custom-fields-container'),
    addCustomFieldRowBtn: q('#add-custom-field-row-btn')
  };

  function on(el, ev, fn) { if (!el) return; el.addEventListener(ev, fn); }

  function toast(msg, type = 'info') {
    if (!dom.toastContainer) return console.log(type.toUpperCase() + ': ' + msg);
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${escapeHTML(msg)}</span>`;
    dom.toastContainer.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getAvatarHtml(name, picture) {
    if (picture) {
      return `<img src="/${picture}" class="contact-card-avatar" alt="${escapeHTML(name)}" onerror="this.style.display='none'">`;
    }
    const initials = (name || '?').trim().split(' ').map(p => p[0] || '').join('').substring(0,2).toUpperCase() || '?';
    let hash = 0; for (let i=0;i<name.length;i++) hash = name.charCodeAt(i) + ((hash<<5)-hash);
    const hue = Math.abs(hash % 360);
    return `<div class="contact-card-avatar" style="background: linear-gradient(135deg, hsl(${hue},70%,65%), hsl(${(hue+45)%360},75%,55%)); color: white; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:700;">${escapeHTML(initials)}</div>`;
  }

  function setTheme(theme) {
    state.theme = theme;
    if (dom.html) dom.html.setAttribute('data-theme', theme);
    localStorage.setItem('datastorer_theme', theme);
    if (dom.themeToggleIcon) dom.themeToggleIcon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }

  function showAuthSection() {
    if (dom.authSection) dom.authSection.style.display = 'flex';
    if (dom.dashboardSection) dom.dashboardSection.style.display = 'none';
    if (dom.userProfileWidget) dom.userProfileWidget.style.display = 'none';
    if (dom.loginPwUsername) dom.loginPwUsername.focus();
  }

  function showDashboardSection() {
    if (dom.authSection) dom.authSection.style.display = 'none';
    if (dom.dashboardSection) dom.dashboardSection.style.display = 'block';
    if (dom.userProfileWidget) dom.userProfileWidget.style.display = 'flex';
    if (dom.userGreeting && state.user) dom.userGreeting.textContent = `Hi, ${state.user.username}`;
  }

  function switchAuthTab(tabName) {
    dom.authTabs.forEach(t => t.classList.remove('active'));
    dom.authForms.forEach(f => f.classList.remove('active'));
    if (tabName === 'register') {
      if (dom.registerForm) dom.registerForm.classList.add('active');
      if (dom.authTabsHeader) dom.authTabsHeader.style.display = 'none';
      if (dom.regUsername) dom.regUsername.focus();
      return;
    }
    if (dom.authTabsHeader) dom.authTabsHeader.style.display = 'flex';
    const tab = dom.authTabs.find(t => t.dataset && t.dataset.tab === tabName);
    if (tab) tab.classList.add('active');
    if (tabName === 'password' && dom.passwordLoginForm) dom.passwordLoginForm.classList.add('active');
    if (tabName === 'pin' && dom.pinLoginForm) dom.pinLoginForm.classList.add('active');
    if (tabName === 'biometrics' && dom.biometricsLoginForm) dom.biometricsLoginForm.classList.add('active');
  }

  // -------------------- Contacts CRUD --------------------
  async function loadContacts() {
    if (!API || !API.getContacts) return;
    try {
      const contacts = await API.getContacts();
      state.contacts = Array.isArray(contacts) ? contacts : [];
      renderContacts(state.contacts);
    } catch (err) {
      toast('Failed to load contacts', 'error');
    }
  }

  function renderContacts(list) {
    if (!dom.contactsGrid) return;
    dom.contactsGrid.innerHTML = '';
    if (!list || list.length === 0) {
      if (dom.noContactsView) dom.noContactsView.style.display = 'flex';
      if (dom.statTotalContacts) dom.statTotalContacts.textContent = '0';
      if (dom.statMappedContacts) dom.statMappedContacts.textContent = '0';
      return;
    }
    if (dom.noContactsView) dom.noContactsView.style.display = 'none';

    let mapped = 0;
    list.forEach(contact => {
      const card = document.createElement('div'); card.className = 'contact-card glass';
      const name = escapeHTML(contact.name || 'Unnamed');
      const phone = escapeHTML(contact.phone || (contact.phones && contact.phones[0]) || '');
      const email = escapeHTML(contact.email || '');
      const location = escapeHTML(contact.location || '');
      const avatar = getAvatarHtml(contact.name || '', contact.picture || null);
      if (contact.location) mapped++;

      const actions = document.createElement('div'); actions.className = 'contact-card-actions';
      const editBtn = document.createElement('button'); editBtn.className = 'card-action-btn edit-btn'; editBtn.title = 'Edit Contact'; editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
      editBtn.addEventListener('click', () => openContactModal(contact.id));
      const delBtn = document.createElement('button'); delBtn.className = 'card-action-btn delete-btn'; delBtn.title = 'Delete Contact'; delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      delBtn.addEventListener('click', () => deleteContact(contact.id));
      actions.appendChild(editBtn); actions.appendChild(delBtn);

      card.appendChild(actions);
      const wrapper = document.createElement('div'); wrapper.innerHTML = avatar; card.appendChild(wrapper.firstChild || wrapper);

      const h = document.createElement('h3'); h.className = 'contact-card-name'; h.textContent = name; card.appendChild(h);
      const p = document.createElement('div'); p.className = 'contact-card-phone'; p.innerHTML = `<i class="fa-solid fa-phone"></i> <span>${phone}</span>`; card.appendChild(p);
      if (email) card.insertAdjacentHTML('beforeend', `<div class="contact-card-email"><i class="fa-solid fa-envelope"></i> <a href="mailto:${encodeURIComponent(contact.email)}">${email}</a></div>`);
      card.insertAdjacentHTML('beforeend', `<div class="contact-card-location" title="${location || 'No Address stored'}"><i class="fa-solid fa-location-dot"></i> <span>${location || 'No Address Stored'}</span></div>`);
      
      // Inject Custom Fields (Metadata Badges)
      if (contact.customFields && contact.customFields.length > 0) {
        const fieldsHtml = contact.customFields.map(f => `
          <div class="contact-card-field-badge">
            <span class="field-label">${escapeHTML(f.label)}:</span>
            <span class="field-val">${escapeHTML(f.value)}</span>
          </div>
        `).join('');
        card.insertAdjacentHTML('beforeend', `<div class="contact-card-custom-fields">${fieldsHtml}</div>`);
      }

      // Inject Additional Images Gallery
      if (contact.additionalImages && contact.additionalImages.length > 0) {
        const thumbsHtml = contact.additionalImages.map(img => `
          <img src="/${img}" class="contact-card-gallery-thumb" alt="Gallery Photo" onclick="window.viewGalleryPhoto('/${img}')">
        `).join('');
        card.insertAdjacentHTML('beforeend', `
          <div class="contact-card-gallery">
            <p class="gallery-title"><i class="fa-solid fa-images"></i> Photos (${contact.additionalImages.length})</p>
            <div class="gallery-thumbs">${thumbsHtml}</div>
          </div>
        `);
      }

      if (contact.location) {
        card.insertAdjacentHTML('beforeend', `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.location)}" target="_blank" class="gmaps-link"><i class="fa-solid fa-map-location-dot"></i> View on GMaps</a>`);
      } else {
        card.insertAdjacentHTML('beforeend', `<button class="gmaps-link" disabled style="opacity:0.5;cursor:not-allowed;background:var(--glass-border);"><i class="fa-solid fa-location-crosshairs"></i> No Map Location</button>`);
      }

      dom.contactsGrid.appendChild(card);
    });

    if (dom.statTotalContacts) dom.statTotalContacts.textContent = String(list.length);
    if (dom.statMappedContacts) dom.statMappedContacts.textContent = String(mapped);
  }

  function addPhoneInput(value = '', showRemove = false) {
    if (!dom.phoneList) return;
    const row = document.createElement('div'); row.className = 'phone-row';
    const wrapper = document.createElement('div'); wrapper.className = 'input-wrapper'; wrapper.innerHTML = '<i class="fa-solid fa-phone input-icon"></i>';
    const input = document.createElement('input'); input.type = 'tel'; input.className = 'contact-phone-input'; input.placeholder = 'Enter mobile number'; input.value = value;
    wrapper.appendChild(input);
    row.appendChild(wrapper);
    const rem = document.createElement('button'); rem.type = 'button'; rem.className = 'btn btn-secondary btn-sm remove-phone-btn'; rem.style.display = showRemove ? 'inline-block' : 'none'; rem.innerHTML = '<i class="fa-solid fa-trash"></i>';
    rem.addEventListener('click', () => row.remove());
    row.appendChild(rem);
    dom.phoneList.appendChild(row);
  }

  function openContactModal(contactId = null) {
    state.editingContactId = contactId || null;
    if (!dom.contactForm) return;
    dom.contactForm.reset();
    dom.avatarPreview && (dom.avatarPreview.src = '/api/placeholder');
    state.pictureFile = null;
    state.additionalImageFiles = [];
    state.existingAdditionalImages = [];
    dom.phoneList && (dom.phoneList.innerHTML = '');
    dom.customFieldsContainer && (dom.customFieldsContainer.innerHTML = '');
    if (dom.additionalImagesPreviewGrid) dom.additionalImagesPreviewGrid.innerHTML = '';

    if (contactId) {
      const contact = state.contacts.find(c => c.id === contactId);
      if (!contact) return;
      dom.contactEditId && (dom.contactEditId.value = contact.id);
      dom.contactName && (dom.contactName.value = contact.name || '');
      const phones = contact.phones && contact.phones.length ? contact.phones : (contact.phone ? [contact.phone] : []);
      if (phones.length) phones.forEach((p, idx) => addPhoneInput(p, idx !== 0)); else addPhoneInput('', false);
      dom.contactEmail && (dom.contactEmail.value = contact.email || '');
      dom.contactOccupation && (dom.contactOccupation.value = contact.occupation || '');
      dom.contactOccupationLocation && (dom.contactOccupationLocation.value = contact.occupationLocation || '');
      dom.contactNotes && (dom.contactNotes.value = contact.notes || '');
      dom.contactLocation && (dom.contactLocation.value = contact.location || '');
      if (contact.picture && dom.avatarPreview) dom.avatarPreview.src = '/' + contact.picture;

      // Load existing additional images
      state.existingAdditionalImages = contact.additionalImages ? [...contact.additionalImages] : [];
      renderAdditionalImagesPreviewGrid();

      // Load existing custom fields
      if (contact.customFields && contact.customFields.length > 0) {
        contact.customFields.forEach(f => addCustomFieldRow(f.label, f.value));
      }
    } else {
      dom.contactEditId && (dom.contactEditId.value = '');
      addPhoneInput('', false);
    }
    if (dom.contactModal) dom.contactModal.style.display = 'flex';
  }

  function closeContactModal() { if (dom.contactModal) dom.contactModal.style.display = 'none'; }

  async function handleContactFormSubmit(e) {
    e.preventDefault();
    const editId = state.editingContactId || (dom.contactEditId && dom.contactEditId.value) || null;
    const name = dom.contactName && dom.contactName.value.trim();
    const phones = dom.phoneList ? Array.from(dom.phoneList.querySelectorAll('.contact-phone-input')).map(i => i.value.trim()).filter(Boolean) : [];
    const email = dom.contactEmail && dom.contactEmail.value.trim();
    const occupation = dom.contactOccupation && dom.contactOccupation.value.trim();
    const occupationLocation = dom.contactOccupationLocation && dom.contactOccupationLocation.value.trim();
    const notes = dom.contactNotes && dom.contactNotes.value.trim();
    const location = dom.contactLocation && dom.contactLocation.value.trim();

    // Compile custom fields
    const customFields = [];
    if (dom.customFieldsContainer) {
      const rows = dom.customFieldsContainer.querySelectorAll('.custom-field-row');
      rows.forEach(row => {
        const lbl = row.querySelector('.custom-field-label').value.trim();
        const val = row.querySelector('.custom-field-value').value.trim();
        if (lbl && val) {
          customFields.push({ label: lbl, value: val });
        }
      });
    }

    if (!name || phones.length === 0) { toast('Name and at least one mobile number are required', 'error'); return; }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('phone', phones[0] || '');
    formData.append('phones', JSON.stringify(phones));
    formData.append('email', email || '');
    formData.append('occupation', occupation || '');
    formData.append('occupationLocation', occupationLocation || '');
    formData.append('notes', notes || '');
    formData.append('location', location || '');
    formData.append('customFields', JSON.stringify(customFields));

    if (state.pictureFile) formData.append('picture', state.pictureFile);

    // Append new additional files
    state.additionalImageFiles.forEach(file => {
      formData.append('additionalImages', file);
    });

    // Append existing images kept (for update)
    if (editId) {
      formData.append('existingAdditionalImages', JSON.stringify(state.existingAdditionalImages));
    }

    try {
      if (editId) { await API.updateContact(editId, formData); toast('Contact updated', 'success'); }
      else { await API.createContact(formData); toast('Contact saved', 'success'); }
      closeContactModal(); await loadContacts();
    } catch (err) { toast(err.message || 'Save failed', 'error'); }
  }

  async function deleteContact(contactId) {
    if (!confirm('Delete this contact? This cannot be undone.')) return;
    try { await API.deleteContact(contactId); toast('Contact deleted', 'info'); await loadContacts(); } catch (err) { toast(err.message || 'Delete failed', 'error'); }
  }

  function renderAdditionalImagesPreviewGrid() {
    if (!dom.additionalImagesPreviewGrid) return;
    dom.additionalImagesPreviewGrid.innerHTML = '';

    // Render existing images with delete option
    state.existingAdditionalImages.forEach((img, index) => {
      const thumb = document.createElement('div');
      thumb.className = 'image-preview-thumb';
      thumb.innerHTML = `
        <img src="/${img}" alt="Attached Image">
        <button type="button" class="remove-img-btn" title="Remove image"><i class="fa-solid fa-trash"></i></button>
      `;
      thumb.querySelector('.remove-img-btn').addEventListener('click', () => {
        state.existingAdditionalImages.splice(index, 1);
        renderAdditionalImagesPreviewGrid();
      });
      dom.additionalImagesPreviewGrid.appendChild(thumb);
    });

    // Render new files
    state.additionalImageFiles.forEach((file, index) => {
      const thumb = document.createElement('div');
      thumb.className = 'image-preview-thumb';
      
      const img = document.createElement('img');
      const reader = new FileReader();
      reader.onload = (ev) => { img.src = ev.target.result; };
      reader.readAsDataURL(file);
      thumb.appendChild(img);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'remove-img-btn';
      delBtn.title = 'Remove image';
      delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      delBtn.addEventListener('click', () => {
        state.additionalImageFiles.splice(index, 1);
        renderAdditionalImagesPreviewGrid();
      });
      thumb.appendChild(delBtn);

      dom.additionalImagesPreviewGrid.appendChild(thumb);
    });
  }

  function addCustomFieldRow(label = '', value = '') {
    if (!dom.customFieldsContainer) return;
    const row = document.createElement('div');
    row.className = 'custom-field-row';
    row.innerHTML = `
      <div class="input-wrapper" style="max-width: 140px;">
        <input type="text" class="custom-field-label" placeholder="Label" value="${escapeHTML(label)}" required>
      </div>
      <div class="input-wrapper">
        <input type="text" class="custom-field-value" placeholder="Value" value="${escapeHTML(value)}" required>
      </div>
      <button type="button" class="btn btn-secondary btn-sm remove-custom-field-btn"><i class="fa-solid fa-trash"></i></button>
    `;
    row.querySelector('.remove-custom-field-btn').addEventListener('click', () => row.remove());
    dom.customFieldsContainer.appendChild(row);
  }

  function updatePinDots() {
    if (!dom.pinDots) return;
    const val = (dom.loginPinValue && dom.loginPinValue.value) || '';
    dom.pinDots.forEach((dot, idx) => {
      if (idx < val.length) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  async function refreshSettingsUI() {
    try {
      const info = await API.getMe();
      if (dom.pinStatusLabel) {
        if (info.hasPin) {
          dom.pinStatusLabel.textContent = 'PIN is set';
          dom.pinStatusLabel.className = 'badge';
          if (dom.settingsRemovePinBtn) dom.settingsRemovePinBtn.style.display = 'inline-block';
          if (dom.settingsSetPinBtn) dom.settingsSetPinBtn.textContent = 'Change PIN';
        } else {
          dom.pinStatusLabel.textContent = 'PIN not set';
          dom.pinStatusLabel.className = 'badge';
          if (dom.settingsRemovePinBtn) dom.settingsRemovePinBtn.style.display = 'none';
          if (dom.settingsSetPinBtn) dom.settingsSetPinBtn.textContent = 'Set New PIN';
        }
      }
      if (dom.bioStatusLabel) {
        if (info.hasBiometrics) {
          dom.bioStatusLabel.textContent = 'Registered';
          dom.bioStatusLabel.className = 'badge';
        } else {
          dom.bioStatusLabel.textContent = 'Not registered';
          dom.bioStatusLabel.className = 'badge';
        }
      }
    } catch (err) {
      console.error('Failed to load settings details:', err);
    }
  }

  // -------------------- Event wiring --------------------
  function registerEvents() {
    on(dom.themeToggle, 'click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
    dom.authTabs.forEach(t => on(t, 'click', () => switchAuthTab(t.dataset.tab)));
    qa('.switch-to-register').forEach(el => on(el, 'click', (e) => { e.preventDefault(); switchAuthTab('register'); }));
    qa('.switch-to-login').forEach(el => on(el, 'click', (e) => { e.preventDefault(); switchAuthTab('password'); }));

    on(dom.passwordLoginForm, 'submit', async (e) => {
      e.preventDefault();
      const username = (dom.loginPwUsername && dom.loginPwUsername.value || '').trim();
      const password = (dom.loginPwPassword && dom.loginPwPassword.value) || '';
      if (!username || !password) { toast('Enter username and password', 'error'); return; }
      try { const data = await API.login(username, password); state.user = data.user; toast('Logged in', 'success'); showDashboardSection(); await loadContacts(); } catch (err) { toast(err.message || 'Login failed', 'error'); }
    });

    on(dom.registerForm, 'submit', async (e) => {
      e.preventDefault();
      const username = (dom.regUsername && dom.regUsername.value || '').trim();
      const password = (dom.regPassword && dom.regPassword.value) || '';
      const pin = (dom.regPin && dom.regPin.value) || '';
      if (!username || !password) { toast('Choose username and password', 'error'); return; }
      try { const data = await API.register(username, password, pin); state.user = data.user; toast('Registered and logged in', 'success'); showDashboardSection(); await loadContacts(); dom.registerForm.reset(); } catch (err) { toast(err.message || 'Registration failed', 'error'); }
    });

    on(dom.logoutBtn, 'click', () => { if (API && API.setToken) API.setToken(null); state.user = null; toast('Logged out', 'info'); showAuthSection(); });

    on(dom.addContactBtn, 'click', () => openContactModal());
    on(dom.contactModalClose, 'click', closeContactModal);
    on(dom.contactModalCancel, 'click', closeContactModal);
    on(dom.contactForm, 'submit', handleContactFormSubmit);
    on(dom.addPhoneBtn, 'click', () => addPhoneInput('', true));

    on(dom.triggerAdditionalImagesBtn, 'click', () => {
      if (dom.additionalImagesInput) dom.additionalImagesInput.click();
    });

    on(dom.additionalImagesInput, 'change', () => {
      if (!dom.additionalImagesInput || !dom.additionalImagesInput.files) return;
      const files = Array.from(dom.additionalImagesInput.files);
      files.forEach(f => {
        if (f.size > 5 * 1024 * 1024) {
          toast(`Image ${f.name} is too large (max 5MB)`, 'error');
        } else {
          state.additionalImageFiles.push(f);
        }
      });
      dom.additionalImagesInput.value = ''; // Reset input to allow re-selection
      renderAdditionalImagesPreviewGrid();
    });

    on(dom.addCustomFieldRowBtn, 'click', () => {
      addCustomFieldRow();
    });

    on(dom.contactPictureInput, 'change', () => {
      const f = dom.contactPictureInput.files && dom.contactPictureInput.files[0];
      if (!f) return; if (f.size > 5 * 1024 * 1024) { toast('Image too large (max 5MB)', 'error'); dom.contactPictureInput.value = ''; return; }
      state.pictureFile = f; const reader = new FileReader(); reader.onload = (ev) => { if (dom.avatarPreview) dom.avatarPreview.src = ev.target.result; }; reader.readAsDataURL(f);
    });

    on(dom.searchInput, 'input', () => {
      const qv = dom.searchInput.value.toLowerCase().trim(); if (!qv) return renderContacts(state.contacts);
      const filtered = (state.contacts || []).filter(c => {
        const phones = c.phones && c.phones.length ? c.phones : (c.phone ? [c.phone] : []);
        return (c.name && c.name.toLowerCase().includes(qv)) || phones.some(p => p && p.toLowerCase().includes(qv)) || (c.location && c.location.toLowerCase().includes(qv)) || (c.email && c.email.toLowerCase().includes(qv));
      }); renderContacts(filtered);
    });

    // --- Settings Modal Events ---
    on(dom.settingsBtn, 'click', async () => {
      if (dom.settingsModal) {
        dom.settingsModal.style.display = 'flex';
        await refreshSettingsUI();
      }
    });

    on(dom.settingsModalClose, 'click', () => {
      if (dom.settingsModal) dom.settingsModal.style.display = 'none';
    });

    on(dom.settingsModalDone, 'click', () => {
      if (dom.settingsModal) dom.settingsModal.style.display = 'none';
    });

    // --- PIN Management Settings ---
    on(dom.settingsSetPinBtn, 'click', () => {
      if (dom.settingsPinFormWrapper) {
        dom.settingsPinFormWrapper.style.display = dom.settingsPinFormWrapper.style.display === 'none' ? 'block' : 'none';
      }
    });

    on(dom.cancelNewPinBtn, 'click', () => {
      if (dom.settingsPinFormWrapper) dom.settingsPinFormWrapper.style.display = 'none';
      if (dom.settingsNewPin) dom.settingsNewPin.value = '';
    });

    on(dom.saveNewPinBtn, 'click', async () => {
      const newPin = (dom.settingsNewPin && dom.settingsNewPin.value || '').trim();
      if (!newPin || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
        toast('PIN must be 4 to 6 numeric digits', 'error');
        return;
      }
      try {
        await API.updatePin(newPin);
        toast('PIN updated successfully', 'success');
        if (dom.settingsPinFormWrapper) dom.settingsPinFormWrapper.style.display = 'none';
        if (dom.settingsNewPin) dom.settingsNewPin.value = '';
        await refreshSettingsUI();
      } catch (err) {
        toast(err.message || 'Failed to update PIN', 'error');
      }
    });

    on(dom.settingsRemovePinBtn, 'click', async () => {
      if (!confirm('Are you sure you want to remove your PIN login?')) return;
      try {
        await API.updatePin(null);
        toast('PIN removed successfully', 'success');
        if (dom.settingsPinFormWrapper) dom.settingsPinFormWrapper.style.display = 'none';
        await refreshSettingsUI();
      } catch (err) {
        toast(err.message || 'Failed to remove PIN', 'error');
      }
    });

    // --- Biometrics Setup Settings ---
    on(dom.settingsRegisterBioBtn, 'click', async () => {
      try {
        await WebAuthn.registerDevice();
        toast('Biometric device registered successfully!', 'success');
        await refreshSettingsUI();
      } catch (err) {
        toast(err.message || 'Biometric registration failed', 'error');
      }
    });

    // --- PIN Login Keypad & Actions ---
    if (dom.keyBtns) {
      dom.keyBtns.forEach(btn => {
        on(btn, 'click', (e) => {
          e.preventDefault();
          const val = btn.dataset.val;
          if (val !== undefined) {
            const current = (dom.loginPinValue && dom.loginPinValue.value) || '';
            if (current.length < 6) {
              dom.loginPinValue.value = current + val;
              updatePinDots();
            }
          }
        });
      });
    }

    on(dom.keyClear, 'click', (e) => {
      e.preventDefault();
      if (dom.loginPinValue) dom.loginPinValue.value = '';
      updatePinDots();
    });

    on(dom.keyBack, 'click', (e) => {
      e.preventDefault();
      const current = (dom.loginPinValue && dom.loginPinValue.value) || '';
      if (current.length > 0) {
        dom.loginPinValue.value = current.slice(0, -1);
        updatePinDots();
      }
    });

    on(dom.pinSubmitBtn, 'click', async (e) => {
      e.preventDefault();
      const username = (dom.loginPinUsername && dom.loginPinUsername.value || '').trim();
      const pin = (dom.loginPinValue && dom.loginPinValue.value) || '';
      if (!username || !pin) {
        toast('Username and PIN are required', 'error');
        return;
      }
      try {
        const data = await API.pinLogin(username, pin);
        state.user = data.user;
        toast('Logged in successfully', 'success');
        showDashboardSection();
        await loadContacts();
        if (dom.loginPinUsername) dom.loginPinUsername.value = '';
        if (dom.loginPinValue) dom.loginPinValue.value = '';
        updatePinDots();
      } catch (err) {
        toast(err.message || 'PIN login failed', 'error');
      }
    });

    // --- Biometric Login Action ---
    on(dom.bioScanTrigger, 'click', async (e) => {
      e.preventDefault();
      const username = (dom.loginBioUsername && dom.loginBioUsername.value || '').trim();
      if (!username) {
        toast('Please enter your username', 'error');
        return;
      }
      if (dom.bioScannerStatus) dom.bioScannerStatus.textContent = 'Scanning...';
      if (dom.bioScanTrigger) dom.bioScanTrigger.classList.add('scanning');
      try {
        const data = await WebAuthn.loginDevice(username);
        state.user = data.user;
        toast('Logged in successfully with biometrics', 'success');
        showDashboardSection();
        await loadContacts();
        if (dom.loginBioUsername) dom.loginBioUsername.value = '';
      } catch (err) {
        toast(err.message || 'Biometric login failed', 'error');
      } finally {
        if (dom.bioScannerStatus) dom.bioScannerStatus.textContent = 'Click above to scan';
        if (dom.bioScanTrigger) dom.bioScanTrigger.classList.remove('scanning');
      }
    });
  }

  async function checkAuthSession() {
    try {
      const token = API && API.getToken ? API.getToken() : null;
      if (!token) { showAuthSection(); return; }
      const data = await API.getMe(); state.user = data; showDashboardSection(); await loadContacts();
    } catch (err) { if (API && API.setToken) API.setToken(null); showAuthSection(); }
  }

  function viewGalleryPhoto(src) {
    let lb = document.getElementById('lightbox-modal');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'lightbox-modal';
      lb.className = 'modal-overlay';
      lb.style.zIndex = '2000';
      lb.innerHTML = `
        <div class="modal-card glass" style="max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; padding: 20px; border: 1px solid var(--glass-border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg);">
          <button class="modal-close" style="position: absolute; right: 15px; top: 15px; background: none; border: none; font-size: 24px; color: var(--text-main); cursor: pointer;"><i class="fa-solid fa-xmark"></i></button>
          <img id="lightbox-img" src="" style="max-width: 100%; max-height: 80vh; border-radius: var(--radius-sm); object-fit: contain;">
        </div>
      `;
      document.body.appendChild(lb);
      lb.querySelector('.modal-close').addEventListener('click', () => lb.style.display = 'none');
      lb.addEventListener('click', (e) => { if (e.target === lb) lb.style.display = 'none'; });
    }
    const img = lb.querySelector('#lightbox-img');
    if (img) img.src = src;
    lb.style.display = 'flex';
  }

  // Graceful global helpers for inline handlers (if any)
  window.openContactModal = openContactModal;
  window.deleteContact = deleteContact;
  window.viewGalleryPhoto = viewGalleryPhoto;

  // Startup
  function startup() { setTheme(state.theme); registerEvents(); checkAuthSession(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startup); else startup();

})();
