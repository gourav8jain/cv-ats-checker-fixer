// Generates the ES256 key pair used to sign licenses.
//   node worker/scripts/genkeys.mjs
// Put PRIVATE into the worker secret SIGNING_KEY_JWK and PUBLIC into the web build env VITE_PUBLIC_KEY_JWK.
const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const priv = await crypto.subtle.exportKey('jwk', privateKey);
const pub = await crypto.subtle.exportKey('jwk', publicKey);
delete pub.key_ops; delete pub.ext;
console.log('PRIVATE (worker secret SIGNING_KEY_JWK — keep secret):\n' + JSON.stringify(priv));
console.log('\nPUBLIC (GitHub variable VITE_PUBLIC_KEY_JWK):\n' + JSON.stringify(pub));
