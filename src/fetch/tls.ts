/**
 * The single Chrome-fingerprint TLS agent shared by every AH HTTP client
 * (the anonymous GraphQL transport, the member GraphQL transport, and the
 * mobile-auth token calls).
 *
 * Akamai's edge rejects Node's default OpenSSL cipher list as non-browser. A
 * Chrome-like cipher list yields a TLS Client Hello (JA3/JA4) the bot wall
 * accepts. Without this, requests from Linux Node return HTTP 403 before any
 * HTTP-layer inspection. Confirmed via tls.peet.ws fingerprint capture. All AH
 * hosts (ah.nl, api.ah.nl, login.ah.nl) sit behind the same edge.
 */

import { Agent } from 'undici';

const CHROME_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA',
].join(':');

export const tlsAgent = new Agent({ connect: { ciphers: CHROME_CIPHERS } });
