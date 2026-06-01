const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'data-storer-super-secret-key-123456789';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// In-memory challenge storage for WebAuthn (username -> challenge string)
const currentChallenges = new Map();

// Multer storage configuration for contact images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'picture-' + uniqueSuffix + ext);
  }
});

// File filter to ensure only image files are uploaded
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, GIF, and WEBP are allowed.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Middleware to authenticate JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Session expired or invalid token. Please log in again.' });
    }
    req.user = decoded; // decoded contains { id, username }
    next();
  });
}

// ----------------------------------------------------
// AUTH API ENDPOINTS
// ----------------------------------------------------

// Register a new user
app.post('/api/auth/register', (req, res) => {
  const { username, password, pin } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = db.createUser(username, password, pin || null);
    
    // Auto login by returning JWT
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ 
      message: 'User registered successfully',
      token,
      user: { id: user.id, username: user.username, hasPin: !!user.pinHash }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Login via standard Password
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.findUserByUsername(username);
  if (!user || !db.verifyPassword(user, password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({
    token,
    user: { id: user.id, username: user.username, hasPin: !!user.pinHash }
  });
});

// Login via PIN
app.post('/api/auth/pin-login', (req, res) => {
  const { username, pin } = req.body;

  if (!username || !pin) {
    return res.status(400).json({ error: 'Username and PIN are required' });
  }

  const user = db.findUserByUsername(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or PIN' });
  }

  if (!user.pinHash) {
    return res.status(400).json({ error: 'PIN login is not set up for this user. Please log in with password.' });
  }

  if (!db.verifyPin(user, pin)) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({
    token,
    user: { id: user.id, username: user.username, hasPin: true }
  });
});

// Get current user details
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({
    id: user.id,
    username: user.username,
    hasPin: !!user.pinHash,
    hasBiometrics: user.authenticators.length > 0
  });
});

// Update user PIN
app.post('/api/auth/update-pin', authenticateToken, (req, res) => {
  const { pin } = req.body;
  try {
    db.setUserPin(req.user.id, pin || null);
    res.json({ message: pin ? 'PIN updated successfully' : 'PIN removed successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------
// WEBAUTHN (BIOMETRICS) ENDPOINTS
// ----------------------------------------------------

// 1. Generate Registration Options (Device Fingerprint Enrollment)
app.post('/api/webauthn/register-options', authenticateToken, async (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    const options = await generateRegistrationOptions({
      rpName: 'Data Storer Contacts',
      rpID: 'localhost',
      userID: Buffer.from(user.id),
      userName: user.username,
      userDisplayName: user.username,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'cross-platform', // support keys, but platform (Windows Hello/TouchID) is usually preferred. Let's omit this to allow both platform and cross-platform.
      },
    });

    // Remove attachment constraint so it supports both integrated (fingerprint) and external USB keys
    delete options.authenticatorSelection.authenticatorAttachment;

    // Save the challenge temporarily to verify later
    currentChallenges.set(user.username, options.challenge);

    res.json(options);
  } catch (error) {
    console.error('WebAuthn Reg Options Error:', error);
    res.status(500).json({ error: 'Failed to generate registration options: ' + error.message });
  }
});

// 2. Verify Registration Response (Verify and save public key)
app.post('/api/webauthn/register-verify', authenticateToken, async (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const expectedChallenge = currentChallenges.get(user.username);
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'Registration challenge not found. Please try again.' });
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      expectedRPID: 'localhost',
    });

    if (verification.verified) {
      const { registrationInfo } = verification;
      const { credentialPublicKey, credentialID, counter } = registrationInfo;

      // Save credential as Base64url to store in JSON file safely
      const newAuthenticator = {
        credentialID: Buffer.from(credentialID).toString('base64url'),
        credentialPublicKey: Buffer.from(credentialPublicKey).toString('base64url'),
        counter,
        transports: req.body.response.transports || [],
      };

      user.authenticators.push(newAuthenticator);
      db.updateUser(user);
      
      currentChallenges.delete(user.username);
      res.json({ verified: true });
    } else {
      res.status(400).json({ error: 'WebAuthn registration verification failed' });
    }
  } catch (error) {
    console.error('WebAuthn Reg Verification Error:', error);
    res.status(500).json({ error: 'Failed to verify registration: ' + error.message });
  }
});

// 3. Generate Login Options (Challenge for registered credentials)
app.post('/api/webauthn/login-options', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const user = db.findUserByUsername(username);
  if (!user) {
    return res.status(404).json({ error: 'Username not registered' });
  }

  if (user.authenticators.length === 0) {
    return res.status(400).json({ error: 'No biometrics registered for this username. Use password/PIN.' });
  }

  try {
    const options = await generateAuthenticationOptions({
      rpID: 'localhost',
      allowCredentials: user.authenticators.map(auth => ({
        id: Buffer.from(auth.credentialID, 'base64url'),
        type: 'public-key',
        transports: auth.transports,
      })),
      userVerification: 'preferred',
    });

    // Save the challenge
    currentChallenges.set(user.username, options.challenge);

    res.json(options);
  } catch (error) {
    console.error('WebAuthn Auth Options Error:', error);
    res.status(500).json({ error: 'Failed to generate authentication options: ' + error.message });
  }
});

// 4. Verify Login Response (Authenticate signature and issue JWT)
app.post('/api/webauthn/login-verify', async (req, res) => {
  const { username, credential } = req.body;
  
  if (!username || !credential) {
    return res.status(400).json({ error: 'Username and credential details are required' });
  }

  const user = db.findUserByUsername(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const expectedChallenge = currentChallenges.get(user.username);
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'Authentication challenge expired. Please try again.' });
  }

  const authenticator = user.authenticators.find(auth => auth.credentialID === credential.id);
  if (!authenticator) {
    return res.status(400).json({ error: 'Authenticator not registered with this account.' });
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      expectedRPID: 'localhost',
      authenticator: {
        credentialID: Buffer.from(authenticator.credentialID, 'base64url'),
        credentialPublicKey: Buffer.from(authenticator.credentialPublicKey, 'base64url'),
        counter: authenticator.counter,
        transports: authenticator.transports,
      },
    });

    if (verification.verified) {
      // Update credential sign counter
      authenticator.counter = verification.authenticationInfo.newCounter;
      db.updateUser(user);

      currentChallenges.delete(user.username);

      // Create user session token
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
      res.json({
        token,
        user: { id: user.id, username: user.username, hasPin: !!user.pinHash }
      });
    } else {
      res.status(400).json({ error: 'Biometric verification failed.' });
    }
  } catch (error) {
    console.error('WebAuthn Auth Verification Error:', error);
    res.status(500).json({ error: 'Authentication error: ' + error.message });
  }
});

// ----------------------------------------------------
// CONTACTS CRUD ENDPOINTS (AUTHENTICATED)
// ----------------------------------------------------

// Get all user contacts
app.get('/api/contacts', authenticateToken, (req, res) => {
  try {
    const contacts = db.getContacts(req.user.id);
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve contacts' });
  }
});

// Add a new contact (handles optional picture upload)
app.post('/api/contacts', authenticateToken, upload.single('picture'), (req, res) => {
  const { name, phone, phones, location, email, occupation, occupationLocation, notes } = req.body;

  // Parse phones (may be JSON string when sent via FormData)
  let phonesArray = [];
  if (phones) {
    try { phonesArray = JSON.parse(phones); } catch (e) { phonesArray = Array.isArray(phones) ? phones : [phones]; }
  } else if (phone) {
    phonesArray = [phone];
  }

  const primaryPhone = phone || (phonesArray && phonesArray[0]);

  if (!name || !primaryPhone) {
    // Clean up uploaded file if validation fails
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ error: 'Name and Mobile Number are required.' });
  }

  try {
    const contactData = {
      name,
      phone: primaryPhone,
      phones: phonesArray,
      email: email || '',
      occupation: occupation || '',
      occupationLocation: occupationLocation || '',
      notes: notes || '',
      location: location || '',
      picture: req.file ? 'uploads/' + req.file.filename : null
    };

    const newContact = db.addContact(req.user.id, contactData);
    res.status(201).json(newContact);
  } catch (err) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to add contact: ' + err.message });
  }
});

// Update a contact (handles optional picture update)
app.put('/api/contacts/:id', authenticateToken, upload.single('picture'), (req, res) => {
  const contactId = req.params.id;
  const { name, phone, phones, location, email, occupation, occupationLocation, notes } = req.body;

  try {
    const updatedFields = {};
    if (name !== undefined) updatedFields.name = name;
    if (location !== undefined) updatedFields.location = location;
    if (email !== undefined) updatedFields.email = email;
    if (occupation !== undefined) updatedFields.occupation = occupation;
    if (occupationLocation !== undefined) updatedFields.occupationLocation = occupationLocation;
    if (notes !== undefined) updatedFields.notes = notes;

    // Parse phones when provided (expects JSON string or array)
    if (phones !== undefined) {
      try { updatedFields.phones = JSON.parse(phones); } catch (e) { updatedFields.phones = Array.isArray(phones) ? phones : [phones]; }
    } else if (phone !== undefined) {
      updatedFields.phones = [phone];
      updatedFields.phone = phone;
    }

    // Handle new picture upload
    if (req.file) {
      updatedFields.picture = 'uploads/' + req.file.filename;

      // Delete the previous picture file if there was one
      const oldContacts = db.getContacts(req.user.id);
      const contact = oldContacts.find(c => c.id === contactId);
      if (contact && contact.picture && contact.picture.startsWith('uploads/')) {
        const oldPicPath = path.join(__dirname, contact.picture);
        if (fs.existsSync(oldPicPath)) {
          fs.unlinkSync(oldPicPath);
        }
      }
    }

    const updated = db.updateContact(req.user.id, contactId, updatedFields);
    res.json(updated);
  } catch (err) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ error: err.message });
  }
});

// Delete a contact
app.delete('/api/contacts/:id', authenticateToken, (req, res) => {
  const contactId = req.params.id;
  try {
    db.deleteContact(req.user.id, contactId);
    res.json({ message: 'Contact deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Placeholder image helper
app.get('/api/placeholder', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%238b5cf6" width="100" height="100"><circle cx="12" cy="12" r="12" fill="%23f3e8ff"/><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="%238b5cf6"/></svg>`);
});

// Fallback for SPA routing: serve index.html for any other GET requests (navigation)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// Global Error Handler for Multer / File Upload errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
