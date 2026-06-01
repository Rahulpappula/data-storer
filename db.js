const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, 'database');
const CONTACTS_DIR = path.join(DB_DIR, 'contacts');
const USERS_FILE = path.join(DB_DIR, 'users.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure database directories exist
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
if (!fs.existsSync(CONTACTS_DIR)) {
  fs.mkdirSync(CONTACTS_DIR, { recursive: true });
}
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// User-related functions
function getUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function findUserByUsername(username) {
  const users = getUsers();
  return users.find(u => u.username.toLowerCase() === username.toLowerCase().trim());
}

function findUserById(id) {
  const users = getUsers();
  return users.find(u => u.id === id);
}

function createUser(username, password, pin) {
  const users = getUsers();
  const trimmedUsername = username.trim();
  if (users.some(u => u.username.toLowerCase() === trimmedUsername.toLowerCase())) {
    throw new Error('Username already exists');
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const pinHash = pin ? bcrypt.hashSync(pin, salt) : null;

  const newUser = {
    id: Date.now().toString(),
    username: trimmedUsername,
    passwordHash: passwordHash,
    pinHash: pinHash,
    authenticators: [] // For WebAuthn
  };

  users.push(newUser);
  saveUsers(users);
  return newUser;
}

function updateUser(updatedUser) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === updatedUser.id);
  if (idx !== -1) {
    users[idx] = updatedUser;
    saveUsers(users);
    return true;
  }
  return false;
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.passwordHash);
}

function verifyPin(user, pin) {
  if (!user.pinHash) return false;
  return bcrypt.compareSync(pin, user.pinHash);
}

function setUserPin(userId, pin) {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  const salt = bcrypt.genSaltSync(10);
  user.pinHash = pin ? bcrypt.hashSync(pin, salt) : null;
  saveUsers(users);
  return true;
}

// Contacts-related functions
function getUserContactsFile(userId) {
  return path.join(CONTACTS_DIR, `${userId}.json`);
}

function getContacts(userId) {
  const filePath = getUserContactsFile(userId);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    return [];
  }
}

function saveContacts(userId, contacts) {
  const filePath = getUserContactsFile(userId);
  fs.writeFileSync(filePath, JSON.stringify(contacts, null, 2));
}

function addContact(userId, contactData) {
  const contacts = getContacts(userId);
  const phones = Array.isArray(contactData.phones)
    ? contactData.phones.filter(p => p && p.trim())
    : (contactData.phone ? [contactData.phone] : []);

  const newContact = {
    id: Date.now().toString(),
    name: contactData.name,
    // keep `phone` for backwards compatibility (first number)
    phone: phones[0] || (contactData.phone || ''),
    phones: phones,
    email: contactData.email || '',
    occupation: contactData.occupation || '',
    occupationLocation: contactData.occupationLocation || '',
    notes: contactData.notes || '',
    location: contactData.location,
    picture: contactData.picture || null, // relative path or url
    additionalImages: contactData.additionalImages || [], // array of additional image paths
    customFields: contactData.customFields || [], // array of objects { label, value }
    createdAt: new Date().toISOString()
  };
  contacts.push(newContact);
  saveContacts(userId, contacts);
  return newContact;
}

function updateContact(userId, contactId, updatedFields) {
  const contacts = getContacts(userId);
  const idx = contacts.findIndex(c => c.id === contactId);
  if (idx === -1) {
    throw new Error('Contact not found');
  }

  // Preserve picture if it is not being updated or if we are not providing a new one
  const oldPicture = contacts[idx].picture;
  const oldEmail = contacts[idx].email;
  const oldPhones = contacts[idx].phones || (contacts[idx].phone ? [contacts[idx].phone] : []);
  const oldOccupation = contacts[idx].occupation || '';
  const oldOccupationLocation = contacts[idx].occupationLocation || '';
  const oldNotes = contacts[idx].notes || '';
  const oldAdditionalImages = contacts[idx].additionalImages || [];
  const oldCustomFields = contacts[idx].customFields || [];
  contacts[idx] = {
    ...contacts[idx],
    ...updatedFields,
    // Ensure we don't accidentally overwrite with undefined if picture is not passed
    picture: updatedFields.picture !== undefined ? updatedFields.picture : oldPicture,
    email: updatedFields.email !== undefined ? updatedFields.email : oldEmail,
    phones: updatedFields.phones !== undefined ? updatedFields.phones : oldPhones,
    phone: (updatedFields.phones && updatedFields.phones.length) ? updatedFields.phones[0] : (updatedFields.phone !== undefined ? updatedFields.phone : contacts[idx].phone),
    occupation: updatedFields.occupation !== undefined ? updatedFields.occupation : oldOccupation,
    occupationLocation: updatedFields.occupationLocation !== undefined ? updatedFields.occupationLocation : oldOccupationLocation,
    notes: updatedFields.notes !== undefined ? updatedFields.notes : oldNotes,
    additionalImages: updatedFields.additionalImages !== undefined ? updatedFields.additionalImages : oldAdditionalImages,
    customFields: updatedFields.customFields !== undefined ? updatedFields.customFields : oldCustomFields
  };

  saveContacts(userId, contacts);
  return contacts[idx];
}

function deleteContact(userId, contactId) {
  const contacts = getContacts(userId);
  const idx = contacts.findIndex(c => c.id === contactId);
  if (idx === -1) {
    throw new Error('Contact not found');
  }

  // Delete the picture file from disk if it exists
  const contact = contacts[idx];
  if (contact.picture && contact.picture.startsWith('uploads/')) {
    const picPath = path.join(__dirname, contact.picture);
    if (fs.existsSync(picPath)) {
      try {
        fs.unlinkSync(picPath);
      } catch (err) {
        console.error('Error deleting contact image:', err);
      }
    }
  }

  // Delete additional images from disk if they exist
  if (contact.additionalImages && Array.isArray(contact.additionalImages)) {
    contact.additionalImages.forEach(img => {
      if (img && img.startsWith('uploads/')) {
        const imgPath = path.join(__dirname, img);
        if (fs.existsSync(imgPath)) {
          try {
            fs.unlinkSync(imgPath);
          } catch (err) {
            console.error('Error deleting additional image:', err);
          }
        }
      }
    });
  }

  contacts.splice(idx, 1);
  saveContacts(userId, contacts);
  return true;
}

module.exports = {
  findUserByUsername,
  findUserById,
  createUser,
  updateUser,
  verifyPassword,
  verifyPin,
  setUserPin,
  getContacts,
  addContact,
  updateContact,
  deleteContact
};
