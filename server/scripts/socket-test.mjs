/**
 * Smoke test for the realtime layer: signs in two users, connects both sockets,
 * and verifies that a message from one arrives at the other.
 *
 *   node scripts/socket-test.mjs
 */
import { io } from 'socket.io-client';

const API = 'http://localhost:4000';

async function login(identifier, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`login failed: ${json.error?.message}`);
  if (json.data?.twoFactorRequired) {
    throw new Error(
      `account ${identifier} has 2FA enabled - disable it first, or pass a TOTP code`,
    );
  }
  return json.data;
}

function connect(accessToken) {
  return new Promise((resolve, reject) => {
    const socket = io(API, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token: accessToken },
      // The server restricts allowed origins, so send the same Origin the
      // browser would when running through the Vite dev server.
      extraHeaders: { Origin: 'http://localhost:5173' },
      timeout: 5000,
    });
    socket.once('ready', () => resolve(socket));
    socket.once('connect_error', (err) => reject(new Error(`connect_error: ${err.message}`)));
  });
}

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const admin = await login('admin@nimbus.dev', 'Admin@1234');
const sara = await login('sara@nimbus.dev', 'Password@123');

const adminSocket = await connect(admin.accessToken);
const saraSocket = await connect(sara.accessToken);
check('both sockets authenticated', true);

// Find the shared lounge conversation.
const convos = await fetch(`${API}/api/chat/conversations`, {
  headers: { Authorization: `Bearer ${admin.accessToken}` },
}).then((r) => r.json());
const lounge = convos.data.find((c) => c.title === 'WKSL Lounge');
check('found shared conversation', Boolean(lounge), lounge?.title);

// Join the room on both sides.
for (const socket of [adminSocket, saraSocket]) {
  socket.emit('chat:join', { conversationId: lounge.id });
}
await new Promise((r) => setTimeout(r, 400));

// 1. real-time delivery
const delivered = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timed out waiting for chat:message')), 6000);
  saraSocket.once('chat:message', (msg) => {
    clearTimeout(timer);
    resolve(msg);
  });
});

const text = `realtime smoke test ${new Date().toISOString()}`;
adminSocket.emit('chat:send', { conversationId: lounge.id, content: text });

try {
  const msg = await delivered;
  check('message delivered over websocket', msg.content === text, msg.content);
  check('message carries conversationId', msg.conversationId === lounge.id);
  check('sender payload present', Boolean(msg.sender?.displayName), msg.sender?.displayName);
} catch (err) {
  check('message delivered over websocket', false, err.message);
}

// 2. typing indicator
const typingSeen = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('typing indicator timeout')), 5000);
  saraSocket.once('chat:typing', (p) => {
    clearTimeout(timer);
    resolve(p);
  });
});
adminSocket.emit('chat:typing', { conversationId: lounge.id, isTyping: true });
try {
  const t = await typingSeen;
  check('typing indicator broadcast', t.isTyping === true, t.user?.displayName);
} catch (err) {
  check('typing indicator broadcast', false, err.message);
}

// 3. presence roster
const presence = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('presence timeout')), 5000);
  saraSocket.once('presence:online', (list) => {
    clearTimeout(timer);
    resolve(list);
  });
});
adminSocket.disconnect();
await new Promise((r) => setTimeout(r, 200));
saraSocket.disconnect();
const roster = await presence;
check('presence list received', Array.isArray(roster), `${roster.length} online`);

// 4. unauthorized sockets are rejected
const rejected = await new Promise((resolve) => {
  const bad = io(API, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token: 'garbage' },
    extraHeaders: { Origin: 'http://localhost:5173' },
  });
  bad.once('connect_error', () => {
    bad.close();
    resolve(true);
  });
  bad.once('ready', () => {
    bad.close();
    resolve(false);
  });
  setTimeout(() => resolve(false), 5000);
});
check('invalid token rejected', rejected);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);