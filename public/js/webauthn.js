// Helper utilities to translate Base64URL strings to/from ArrayBuffers
function base64urlToArrayBuffer(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) {
    if (pad === 1) throw new Error('Invalid base64url string length');
    base64 += new Array(5 - pad).join('=');
  }
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
}

function arrayBufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const WebAuthn = {
  // Check if WebAuthn is supported by browser and system biometrics are available
  isSupported() {
    return !!(window.PublicKeyCredential && 
              navigator.credentials && 
              navigator.credentials.create);
  },

  // Enroll device biometrics
  async registerDevice() {
    if (!this.isSupported()) {
      throw new Error('Biometric authentication is not supported by your browser or system.');
    }

    // 1. Get registration options from backend
    const options = await API.getWebAuthnRegOptions();
    
    // 2. Convert base64url fields back to binary ArrayBuffers for browser compatibility
    options.challenge = base64urlToArrayBuffer(options.challenge);
    options.user.id = base64urlToArrayBuffer(options.user.id);
    if (options.excludeCredentials) {
      options.excludeCredentials.forEach(cred => {
        cred.id = base64urlToArrayBuffer(cred.id);
      });
    }

    // 3. Trigger native WebAuthn enrollment prompt (Windows Hello / TouchID)
    let credential;
    try {
      credential = await navigator.credentials.create({
        publicKey: options
      });
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        throw new Error('Registration cancelled by user or timed out.');
      }
      throw err;
    }

    // 4. Format/serialize the public-key credentials back to base64url
    const serializedCredential = {
      id: credential.id,
      rawId: arrayBufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: arrayBufferToBase64url(credential.response.clientDataJSON),
        attestationObject: arrayBufferToBase64url(credential.response.attestationObject),
        transports: credential.response.getTransports ? credential.response.getTransports() : []
      }
    };

    // 5. Send serialization verification payload back to backend
    return await API.verifyWebAuthnReg(serializedCredential);
  },

  // Login via device biometrics
  async loginDevice(username) {
    if (!username || username.trim() === '') {
      throw new Error('Please enter your username first to login with biometrics.');
    }

    if (!this.isSupported()) {
      throw new Error('Biometric authentication is not supported by your browser or system.');
    }

    // 1. Get login options / challenge from backend
    const options = await API.getWebAuthnLoginOptions(username);

    // 2. Convert base64url challenge and registered keys back to ArrayBuffers
    options.challenge = base64urlToArrayBuffer(options.challenge);
    if (options.allowCredentials) {
      options.allowCredentials.forEach(cred => {
        cred.id = base64urlToArrayBuffer(cred.id);
      });
    }

    // 3. Trigger native WebAuthn login validation prompt (Windows Hello / TouchID)
    let credential;
    try {
      credential = await navigator.credentials.get({
        publicKey: options
      });
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        throw new Error('Biometric login cancelled or timed out.');
      }
      throw err;
    }

    // 4. Format/serialize public-key signature results back to base64url
    const serializedCredential = {
      id: credential.id,
      rawId: arrayBufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: arrayBufferToBase64url(credential.response.clientDataJSON),
        authenticatorData: arrayBufferToBase64url(credential.response.authenticatorData),
        signature: arrayBufferToBase64url(credential.response.signature),
        userHandle: credential.response.userHandle ? arrayBufferToBase64url(credential.response.userHandle) : undefined
      }
    };

    // 5. Submit verification signature payload to login
    const data = await API.verifyWebAuthnLogin(username, serializedCredential);
    
    // 6. Set token upon validation success
    API.setToken(data.token);
    return data;
  }
};
