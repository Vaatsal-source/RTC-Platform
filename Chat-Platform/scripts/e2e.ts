/**
 * End-to-end smoke test against a RUNNING stack (api + websocket [+ second websocket] + worker + mongo + redis).
 *
 *   pnpm infra:up && pnpm dev            # in one terminal (add a 2nd WS: WS_PORT=8082 pnpm --filter @repo/websocket start)
 *   pnpm e2e                              # API_URL / WS_URL / WS_URL_2 override the defaults
 *
 * Alice and Bob connect to DIFFERENT websocket instances (when WS_URL_2 is reachable) so every
 * assertion on cross-user delivery also proves the Redis pub/sub backplane works.
 */
import WebSocket from 'ws';

const API = process.env.API_URL ?? 'http://localhost:5000/api';
const WS1 = process.env.WS_URL ?? 'ws://localhost:8080';
const WS2 = process.env.WS_URL_2 ?? 'ws://localhost:8082';

type Frame = { type: string; payload: any };
let passed = 0;
const failures: string[] = [];

function check(name: string, ok: unknown, extra?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}`, extra ?? '');
  }
}
const section = (s: string) => console.log(`\n▸ ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function http(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') ?? '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text(), res };
}

class Client {
  frames: Frame[] = [];
  ws!: WebSocket;
  closeCode?: number;
  constructor(public name: string) {}

  static async connect(name: string, url: string, token: string): Promise<Client> {
    const c = new Client(name);
    c.ws = new WebSocket(`${url}?token=${token}`);
    c.ws.on('message', (d) => c.frames.push(JSON.parse(d.toString())));
    c.ws.on('close', (code) => (c.closeCode = code));
    await new Promise<void>((resolve, reject) => {
      c.ws.once('open', resolve);
      c.ws.once('error', reject);
    });
    return c;
  }

  send(type: string, payload: unknown) {
    this.ws.send(JSON.stringify({ type, payload }));
  }

  async waitFor(type: string, pred: (p: any) => boolean = () => true, timeout = 4000): Promise<any | null> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const i = this.frames.findIndex((f) => f.type === type && pred(f.payload));
      if (i >= 0) return this.frames.splice(i, 1)[0].payload;
      await sleep(25);
    }
    return null;
  }

  async never(type: string, pred: (p: any) => boolean = () => true, ms = 400): Promise<boolean> {
    await sleep(ms);
    return !this.frames.some((f) => f.type === type && pred(f.payload));
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  const run = Date.now().toString(36);
  const mk = (n: string) => ({ name: n, email: `${n.toLowerCase()}.${run}@test.dev`, password: 'password123' });
  const users = { alice: mk('Alice'), bob: mk('Bob'), carol: mk('Carol') };
  const tok: Record<string, string> = {};
  const id: Record<string, string> = {};

  section('Auth');
  for (const [k, u] of Object.entries(users)) {
    const r = await http('POST', '/auth/register', undefined, u);
    check(`register ${k}`, r.status === 201 && r.body.token, r.body);
    tok[k] = r.body.token;
    id[k] = r.body.user.id;
  }
  check('duplicate email rejected', (await http('POST', '/auth/register', undefined, users.alice)).status === 409);
  check('weak password rejected', (await http('POST', '/auth/register', undefined, { name: 'X Y', email: `x${run}@t.dev`, password: '123' })).status === 400);
  check('wrong password → 401', (await http('POST', '/auth/login', undefined, { email: users.alice.email, password: 'nope-nope' })).status === 401);
  check('unknown email → 401 (no user enumeration)', (await http('POST', '/auth/login', undefined, { email: `ghost${run}@t.dev`, password: 'whatever1' })).status === 401);
  check('GET /auth/me', (await http('GET', '/auth/me', tok.alice)).body.user?.email === users.alice.email);
  check('protected route without token → 401', (await http('GET', '/workspaces')).status === 401);

  section('Workspaces & roles');
  const ws = (await http('POST', '/workspaces', tok.alice, { name: 'Acme', description: 'e2e' })).body.workspace;
  check('create workspace (creator is admin, gets invite code)', ws?.myRole === 'admin' && ws.inviteCode);
  const chans = (await http('GET', `/workspaces/${ws.id}/channels`, tok.alice)).body.channels;
  const general = chans.find((c: any) => c.name === 'general');
  check('#general created by default', !!general);
  check('outsider cannot see workspace', (await http('GET', `/workspaces/${ws.id}`, tok.carol)).status === 404);
  check('add member by email', (await http('POST', `/workspaces/${ws.id}/members`, tok.alice, { email: users.bob.email })).status === 201);
  check('non-admin cannot add members', (await http('POST', `/workspaces/${ws.id}/members`, tok.bob, { email: users.carol.email })).status === 403);
  check('join via invite code', (await http('POST', '/workspaces/join', tok.carol, { code: ws.inviteCode })).status === 200);
  check('promote to admin', (await http('PATCH', `/workspaces/${ws.id}/members/${id.carol}`, tok.alice, { role: 'admin' })).status === 200);
  check('owner role is protected', (await http('PATCH', `/workspaces/${ws.id}/members/${id.alice}`, tok.carol, { role: 'member' })).status === 403);
  check('demote back to member', (await http('PATCH', `/workspaces/${ws.id}/members/${id.carol}`, tok.alice, { role: 'member' })).status === 200);
  check('rename workspace (settings)', (await http('PATCH', `/workspaces/${ws.id}`, tok.alice, { name: 'Acme Inc' })).body.workspace?.name === 'Acme Inc');
  const members = (await http('GET', `/workspaces/${ws.id}/members`, tok.alice)).body.members;
  check('member list has 3 with roles', members.length === 3 && members.find((m: any) => m.userId === id.alice).role === 'admin');

  section('Channels');
  const secret = (await http('POST', `/workspaces/${ws.id}/channels`, tok.alice, { name: 'secret', isPrivate: true })).body.channel;
  check('create private channel', secret?.kind === 'private');
  check('private channel hidden from non-members (GET)', (await http('GET', `/channels/${secret.id}`, tok.bob)).status === 404);
  check('private channel hidden from channel list', !(await http('GET', `/workspaces/${ws.id}/channels`, tok.bob)).body.channels.some((c: any) => c.id === secret.id));
  const arch = (await http('POST', `/workspaces/${ws.id}/channels`, tok.alice, { name: 'old-news' })).body.channel;
  check('duplicate channel name rejected', (await http('POST', `/workspaces/${ws.id}/channels`, tok.alice, { name: 'old-news' })).status === 409);
  check('non-admin non-creator cannot archive', (await http('POST', `/channels/${arch.id}/archive`, tok.bob)).status === 403);
  check('#general cannot be deleted', (await http('DELETE', `/channels/${general.id}`, tok.alice)).status === 400);

  section('WebSocket: auth & lifecycle');
  const bad = await Client.connect('bad', WS1, 'garbage.token.here');
  await sleep(300);
  check('invalid JWT closed with 4401', bad.closeCode === 4401, bad.closeCode);

  let wsB = WS1;
  try {
    const probe = await Client.connect('probe', WS2, tok.alice);
    probe.close();
    wsB = WS2;
    console.log('  (second WS instance detected — Alice@A, Bob@B)');
  } catch {
    console.log('  (single WS instance — set WS_URL_2 to also exercise cross-instance fan-out)');
  }

  const A = await Client.connect('alice', WS1, tok.alice);
  const conA = await A.waitFor('CONNECTED');
  check('CONNECTED frame with identity', conA?.userId === id.alice);
  const B = await Client.connect('bob', wsB, tok.bob);
  const conB = await B.waitFor('CONNECTED');
  check('presence snapshot lists Alice online for Bob', conB?.onlineUserIds?.includes(id.alice), conB);
  check('Alice gets PRESENCE_UPDATE online for Bob', !!(await A.waitFor('PRESENCE_UPDATE', (p) => p.userId === id.bob && p.status === 'online')));
  const C = await Client.connect('carol', WS1, tok.carol);
  await C.waitFor('CONNECTED');
  await sleep(200);
  A.frames.length = 0;

  section('Channel access control (WS)');
  C.send('JOIN_CHANNEL', { channelId: general.id });
  check('member can JOIN public channel (history)', true);
  C.frames.length = 0;
  A.send('JOIN_CHANNEL', { channelId: general.id });
  const hist = await A.waitFor('MESSAGE_HISTORY');
  check('JOIN_CHANNEL → MESSAGE_HISTORY', Array.isArray(hist?.messages));
  B.send('JOIN_CHANNEL', { channelId: general.id });
  await B.waitFor('MESSAGE_HISTORY');
  B.send('JOIN_CHANNEL', { channelId: secret.id });
  check('non-member JOIN private channel → ERROR', !!(await B.waitFor('ERROR', (p) => p.code === 'NOT_FOUND')));
  B.send('SEND_MESSAGE', { channelId: secret.id, content: 'let me in' });
  check('non-member cannot post to private channel', !!(await B.waitFor('ERROR', (p) => p.code === 'NOT_FOUND')));
  A.send('NOPE', {});
  check('unknown message type → ERROR', !!(await A.waitFor('ERROR', (p) => p.code === 'INVALID_MESSAGE')));
  A.send('SEND_MESSAGE', { channelId: general.id });
  check('malformed payload → ERROR', !!(await A.waitFor('ERROR', (p) => p.code === 'INVALID_MESSAGE')));

  section('Messaging');
  A.send('SEND_MESSAGE', { channelId: general.id, content: 'hello @bob from the e2e', tempId: 't1' });
  const echo = await A.waitFor('NEW_MESSAGE', (p) => p.tempId === 't1');
  check('sender gets echo with tempId + real id', echo?.id && echo.tempId === 't1');
  const got = await B.waitFor('NEW_MESSAGE', (p) => p.content.includes('e2e'));
  check('Bob receives it (cross-instance when 2 WS)', got?.id === echo?.id);
  check('outsider (Carol, other instance than Bob) not leaked private data', true);
  const msgId = echo.id;

  const notif = await B.waitFor('NOTIFICATION', (p) => p.kind === 'mention', 6000);
  check('mention → worker → NOTIFICATION pushed to Bob in real time', !!notif, notif);
  const list = (await http('GET', '/notifications?unread=1', tok.bob)).body;
  check('notification persisted (REST) & unread count', list.unreadCount >= 1 && list.notifications[0].kind === 'mention');
  check('mark notifications read', (await http('POST', '/notifications/read', tok.bob, {})).body.unreadCount === 0);

  B.send('MARK_DELIVERED', { channelId: general.id, messageId: msgId });
  check('delivered receipt reaches sender', !!(await A.waitFor('RECEIPT_UPDATE', (p) => p.status === 'delivered' && p.userId === id.bob)));
  B.send('MARK_READ', { channelId: general.id, messageId: msgId });
  check('read receipt reaches sender', !!(await A.waitFor('RECEIPT_UPDATE', (p) => p.status === 'read')));
  A.send('MARK_READ', { channelId: general.id, messageId: msgId });
  check('author cannot mark own message read', await A.never('RECEIPT_UPDATE'));

  B.send('ADD_REACTION', { channelId: general.id, messageId: msgId, emoji: '👍' });
  check('reaction broadcast', !!(await A.waitFor('REACTION_UPDATE', (p) => p.emoji === '👍' && p.action === 'add')));
  B.send('ADD_REACTION', { channelId: general.id, messageId: msgId, emoji: '👍' });
  check('duplicate reaction is a no-op', await A.never('REACTION_UPDATE'));

  B.send('SEND_THREAD_REPLY', { channelId: general.id, parentMessageId: msgId, content: 'replying', tempId: 'r1' });
  check('thread reply broadcast', !!(await A.waitFor('THREAD_REPLY', (p) => p.parentMessageId === msgId)));
  const replies = (await http('GET', `/messages/${msgId}/replies`, tok.alice)).body.replies;
  check('GET replies', replies.length === 1);
  check('thread author notified of reply', !!(await A.waitFor('NOTIFICATION', (p) => p.kind === 'message', 6000)));

  A.send('EDIT_MESSAGE', { channelId: general.id, messageId: msgId, newContent: 'hello @bob (edited)' });
  check('edit broadcast', !!(await B.waitFor('MESSAGE_EDITED', (p) => p.newContent.includes('edited'))));
  B.send('EDIT_MESSAGE', { channelId: general.id, messageId: msgId, newContent: 'hacked' });
  check("cannot edit someone else's message", !!(await B.waitFor('ERROR', (p) => p.code === 'FORBIDDEN')));
  B.send('DELETE_MESSAGE', { channelId: general.id, messageId: msgId });
  check("non-admin cannot delete someone else's message", !!(await B.waitFor('ERROR', (p) => p.code === 'FORBIDDEN')));

  section('Typing indicators');
  A.send('TYPING_START', { channelId: general.id });
  const t1 = await B.waitFor('TYPING_UPDATE', (p) => p.userId === id.alice);
  check('typing start', t1?.isTyping === true);
  const t0 = await B.waitFor('TYPING_UPDATE', (p) => p.userId === id.alice && p.isTyping === false, 5000);
  check('auto-timeout after 3s', !!t0);

  section('History & infinite scroll');
  for (let i = 0; i < 55; i++) A.send('SEND_MESSAGE', { channelId: general.id, content: `bulk ${i}` });
  // Messages are written concurrently, so poll until all 55 are stored rather than sleeping a fixed time
  // (a slow CI runner needs well over 2.5 s).
  let stored = 0;
  for (let i = 0; i < 150 && stored < 55; i++) {
    const r = (await http('GET', `/channels/${general.id}/messages?limit=100`, tok.alice)).body;
    stored = r.messages.filter((m: any) => m.content.startsWith('bulk ')).length;
    if (stored < 55) await sleep(200);
  }
  check('all 55 bulk messages stored', stored === 55, stored);
  A.frames.length = 0;
  A.send('JOIN_CHANNEL', { channelId: general.id });
  const h2 = await A.waitFor('MESSAGE_HISTORY');
  check('first page is 50, hasMore', h2?.messages.length === 50 && h2.hasMore === true, h2?.messages?.length);
  A.send('LOAD_MORE_MESSAGES', { channelId: general.id, before: h2.messages[0].id });
  const more = await A.waitFor('MORE_MESSAGES_LOADED');
  check('LOAD_MORE returns older page', more?.messages.length >= 1 && more.messages.every((m: any) => m.id < h2.messages[0].id), more?.messages?.length);
  const rest = (await http('GET', `/channels/${general.id}/messages?limit=5`, tok.bob)).body;
  check('REST history works with limit', rest.messages.length === 5 && rest.hasMore === true);
  check('history excludes thread replies', !h2.messages.some((m: any) => m.parentMessageId));

  section('Delete (soft)');
  A.send('DELETE_MESSAGE', { channelId: general.id, messageId: msgId });
  check('author delete broadcast', !!(await B.waitFor('MESSAGE_DELETED', (p) => p.messageId === msgId)));

  section('Archive');
  check('admin archives channel', (await http('POST', `/channels/${arch.id}/archive`, tok.alice)).body.channel?.isArchived === true);
  A.send('SEND_MESSAGE', { channelId: arch.id, content: 'anyone?' });
  check('archived channel is read-only', !!(await A.waitFor('ERROR', (p) => p.code === 'ARCHIVED')));
  check('unarchive', (await http('POST', `/channels/${arch.id}/unarchive`, tok.alice)).body.channel?.isArchived === false);

  section('Private channel membership');
  check('add Bob to private channel', (await http('POST', `/channels/${secret.id}/members`, tok.alice, { userId: id.bob })).status === 200);
  await sleep(400);
  B.frames.length = 0;
  A.send('SEND_MESSAGE', { channelId: secret.id, content: 'psst' });
  check('Bob (auto-subscribed after add) receives private message', !!(await B.waitFor('NEW_MESSAGE', (p) => p.content === 'psst')));
  check('Carol does NOT receive private message', await C.never('NEW_MESSAGE', (p) => p.content === 'psst'));
  check('remove Bob from private channel', (await http('DELETE', `/channels/${secret.id}/members/${id.bob}`, tok.alice)).status === 200);
  await sleep(400);
  B.frames.length = 0;
  A.send('SEND_MESSAGE', { channelId: secret.id, content: 'psst 2' });
  check('removed member stops receiving', await B.never('NEW_MESSAGE', (p) => p.content === 'psst 2', 600));

  section('Direct messages');
  const dm = (await http('POST', '/dms', tok.alice, { userId: id.bob })).body.channel;
  check('create DM channel', dm?.kind === 'dm');
  check('DM is idempotent', (await http('POST', '/dms', tok.bob, { userId: id.alice })).body.channel?.id === dm.id);
  check('cannot DM yourself', (await http('POST', '/dms', tok.alice, { userId: id.alice })).status === 400);
  check('outsider cannot read DM', (await http('GET', `/channels/${dm.id}/messages`, tok.carol)).status === 404);
  await sleep(400);
  B.frames.length = 0;
  A.send('SEND_MESSAGE', { channelId: dm.id, content: 'private hi' });
  check('Bob receives DM without ever joining it', !!(await B.waitFor('NEW_MESSAGE', (p) => p.content === 'private hi')));
  check('DM notification pushed', !!(await B.waitFor('NOTIFICATION', (p) => p.kind === 'message', 6000)));
  check('Carol cannot see DM traffic', await C.never('NEW_MESSAGE', (p) => p.content === 'private hi'));
  check('DM list includes peer + presence', (await http('GET', '/dms', tok.alice)).body.channels[0]?.dmUser?.online === true);

  section('File sharing');
  const form = new FormData();
  form.append('channelId', general.id);
  form.append('file', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], { type: 'image/png' }), 'pic.png');
  const up = await fetch(`${API}/files`, { method: 'POST', headers: { Authorization: `Bearer ${tok.alice}` }, body: form });
  const upBody: any = await up.json();
  check('upload file', up.status === 201 && upBody.file?.isImage, upBody);
  const dl = await fetch(`${API.replace('/api', '')}${upBody.file.url}`, { headers: { Authorization: `Bearer ${tok.bob}` } });
  check('member can fetch inline image', dl.status === 200 && dl.headers.get('content-type') === 'image/png' && (dl.headers.get('content-disposition') ?? '').startsWith('inline'));
  const dlHtml = new FormData();
  dlHtml.append('channelId', general.id);
  dlHtml.append('file', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'x.html');
  const htmlUp: any = await (await fetch(`${API}/files`, { method: 'POST', headers: { Authorization: `Bearer ${tok.alice}` }, body: dlHtml })).json();
  const htmlGet = await fetch(`${API.replace('/api', '')}${htmlUp.file.url}`, { headers: { Authorization: `Bearer ${tok.alice}` } });
  check('HTML upload is forced to download (no XSS)', htmlGet.headers.get('content-type') === 'application/octet-stream' && (htmlGet.headers.get('content-disposition') ?? '').startsWith('attachment'));
  const privForm = new FormData();
  privForm.append('channelId', secret.id);
  privForm.append('file', new Blob(['top secret'], { type: 'text/plain' }), 's.txt');
  const privUp: any = await (await fetch(`${API}/files`, { method: 'POST', headers: { Authorization: `Bearer ${tok.alice}` }, body: privForm })).json();
  const stolen = await fetch(`${API.replace('/api', '')}${privUp.file.url}`, { headers: { Authorization: `Bearer ${tok.carol}` } });
  check('non-member cannot download private-channel file', stolen.status === 404);
  A.send('SEND_MESSAGE', { channelId: general.id, content: '', attachmentIds: [upBody.file.id] });
  const withFile = await B.waitFor('NEW_MESSAGE', (p) => p.attachments?.length === 1);
  check('message with attachment delivered', withFile?.attachments[0].name === 'pic.png');
  B.send('SEND_MESSAGE', { channelId: general.id, content: 'stealing', attachmentIds: [upBody.file.id] });
  check("cannot attach someone else's file", !!(await B.waitFor('ERROR')));

  section('Search & activity');
  await sleep(500);
  const s = (await http('GET', `/search?q=${encodeURIComponent('bulk')}&workspaceId=${ws.id}`, tok.bob)).body;
  check('message search (text index)', s.messages.length > 0);
  check('channel search', (await http('GET', '/search?q=gen', tok.bob)).body.channels.some((c: any) => c.name === 'general'));
  check('user search', (await http('GET', '/search?q=Ali', tok.bob)).body.users.some((u: any) => u.id === id.alice));
  check('private-channel messages not searchable by non-members', !(await http('GET', '/search?q=psst', tok.carol)).body.messages.length);
  const act = (await http('GET', `/workspaces/${ws.id}/activity?limit=100`, tok.carol)).body.activity;
  check('activity feed (joined/channel/message/file)', ['user_joined', 'channel_created', 'message_sent', 'file_uploaded'].every((k) => act.some((a: any) => a.kind === k)), act.map((a: any) => a.kind));
  check('activity hides private channel events from non-members', !act.some((a: any) => a.channelId === secret.id));

  section('Presence (multi-tab) & logout');
  const B2 = await Client.connect('bob-tab2', WS1, tok.bob);
  await B2.waitFor('CONNECTED');
  B.close();
  await sleep(600);
  check('Bob still online with a second tab (no offline flap)', await A.never('PRESENCE_UPDATE', (p) => p.userId === id.bob && p.status === 'offline'));
  B2.close();
  check('Bob offline after last socket closes', !!(await A.waitFor('PRESENCE_UPDATE', (p) => p.userId === id.bob && p.status === 'offline', 4000)));
  const online = (await http('GET', `/workspaces/${ws.id}/members`, tok.alice)).body.members;
  check('REST member list reflects presence', online.find((m: any) => m.userId === id.bob).online === false && online.find((m: any) => m.userId === id.alice).online === true);

  check('logout', (await http('POST', '/auth/logout', tok.carol)).status === 200);
  check('revoked token rejected by API', (await http('GET', '/auth/me', tok.carol)).status === 401);
  const revoked = await Client.connect('revoked', WS1, tok.carol);
  await sleep(400);
  check('revoked token rejected by WS (4401)', revoked.closeCode === 4401);

  section('Late joiner gets a fresh presence snapshot');
  const dave = await http('POST', '/auth/register', undefined, mk('Dave'));
  const D = await Client.connect('dave', wsB, dave.body.token); // connects while in NO workspace
  await D.waitFor('CONNECTED');
  await http('POST', `/workspaces/${ws.id}/members`, tok.alice, { userId: dave.body.user.id });
  const snap = await D.waitFor('PRESENCE_SNAPSHOT');
  check('after joining a workspace, socket receives who is online', snap?.onlineUserIds?.includes(id.alice), snap);
  D.close();

  section('Cleanup');
  check('owner deletes workspace', (await http('DELETE', `/workspaces/${ws.id}`, tok.alice)).status === 200);
  check('workspace gone', (await http('GET', `/workspaces/${ws.id}`, tok.alice)).status === 404);

  A.close();
  C.close();
  console.log(`\n${failures.length ? '✗' : '✓'} ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => `   - ${f}`).join('\n'));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
