const API_URL = '';

const API = {
  getToken() {
    return localStorage.getItem('datastorer_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('datastorer_token', token);
    } else {
      localStorage.removeItem('datastorer_token');
    }
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = options.headers || {};

    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Unless it is FormData, default to JSON content type
    if (!(options.body instanceof FormData) && !headers['Content-Type'] && options.body) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(`${API_URL}${endpoint}`, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err.message);
      throw err;
    }
  },

  // Auth Operations
  async login(username, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    });
    this.setToken(data.token);
    return data;
  },

  async pinLogin(username, pin) {
    const data = await this.request('/api/auth/pin-login', {
      method: 'POST',
      body: { username, pin }
    });
    this.setToken(data.token);
    return data;
  },

  async register(username, password, pin) {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      body: { username, password, pin }
    });
    this.setToken(data.token);
    return data;
  },

  async getMe() {
    return this.request('/api/auth/me', { method: 'GET' });
  },

  async updatePin(pin) {
    return this.request('/api/auth/update-pin', {
      method: 'POST',
      body: { pin }
    });
  },

  // Contacts Operations
  async getContacts() {
    return this.request('/api/contacts', { method: 'GET' });
  },

  async createContact(formData) {
    // Note: formData holds the file, let express parse it as multipart
    return this.request('/api/contacts', {
      method: 'POST',
      body: formData // pass raw FormData, request() will skip setting Content-Type
    });
  },

  async updateContact(id, formData) {
    return this.request(`/api/contacts/${id}`, {
      method: 'PUT',
      body: formData
    });
  },

  async deleteContact(id) {
    return this.request(`/api/contacts/${id}`, {
      method: 'DELETE'
    });
  },

  // WebAuthn Biometrics Operations
  async getWebAuthnRegOptions() {
    return this.request('/api/webauthn/register-options', { method: 'POST' });
  },

  async verifyWebAuthnReg(credentialBody) {
    return this.request('/api/webauthn/register-verify', {
      method: 'POST',
      body: credentialBody
    });
  },

  async getWebAuthnLoginOptions(username) {
    return this.request('/api/webauthn/login-options', {
      method: 'POST',
      body: { username }
    });
  },

  async verifyWebAuthnLogin(username, credentialBody) {
    return this.request('/api/webauthn/login-verify', {
      method: 'POST',
      body: { username, credential: credentialBody }
    });
  }
};
