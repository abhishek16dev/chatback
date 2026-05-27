import nacl from 'tweetnacl';
import { encodeUTF8, decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

export function generateKeyPair() {
  return nacl.box.keyPair();
}

export function serializeKey(key) {
  return encodeBase64(key);
}

export function deserializeKey(base64Key) {
  return decodeBase64(base64Key);
}

export function deriveSharedKey(secretKey, theirPublicKey) {
  return nacl.box.before(theirPublicKey, secretKey);
}

export function encryptMessage(sharedKey, text) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageBytes = decodeUTF8(text);
  const ciphertext = nacl.box.after(messageBytes, nonce, sharedKey);
  return {
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(ciphertext),
  };
}

export function decryptMessage(sharedKey, encryptedPayload) {
  const nonce = decodeBase64(encryptedPayload.nonce);
  const ciphertext = decodeBase64(encryptedPayload.ciphertext);
  const decrypted = nacl.box.open.after(ciphertext, nonce, sharedKey);
  if (!decrypted) return null;
  return encodeUTF8(decrypted);
}
