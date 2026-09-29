'use strict';
/* =========================================================
   ネット対戦（Firebase Realtime Database）
   ・部屋を作った人（ホスト）＝P1 が試合を計算し、状態を0.1秒ごとに送る
   ・参加した人（ゲスト）＝P2 は「どのキャラをどのルートに出すか」だけを送る
   データ構造： rooms/{4桁コード} = { host, guest, created, decks:{0,1}, snap, cmds, left }
   ========================================================= */

const FB_VER = '10.12.2';
const SNAP_SEC = 0.1;
const ROOM_TTL = 30 * 60 * 1000;   // 30分放置された部屋コードは再利用可

const net = {
  role: null, side: 0, code: null, db: null, uid: null, ref: null,
  round: 0, sendT: 0, fxOut: [], acked: 0, sentN: 0, sent: [], decks: [null, null], sentOver: false, subs: [],
};

/* ---------- 初期化 ---------- */
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('script'));
    document.head.appendChild(s);
  });
}
async function netInit() {
  if (net.db) return;
  if (!window.FIREBASE_CONFIG) throw new Error('NOCONFIG');
  if (!window.firebase) {
    for (const m of ['app', 'auth', 'database']) await loadScript(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-${m}-compat.js`);
  }
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  // タブごとに別人として扱う（同じ端末の2タブでも対戦できる）
  await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
  const cred = await firebase.auth().signInAnonymously();
  net.uid = cred.user.uid;
  net.db = firebase.database();
}
function errText(e) {
  const m = String(e && (e.code || e.message) || e);
  if (m === 'NOCONFIG') return 'ネット対戦はまだ準備中です（Firebaseの設定が必要）';
  if (m.includes('admin-restricted') || m.includes('operation-not-allowed')) return 'Firebaseの匿名ログインが有効になっていません';
  if (m.includes('PERMISSION_DENIED') || m.includes('permission')) return 'Firebaseのルール設定を確認してください';
  if (m === 'script' || m.includes('network')) return '通信できませんでした。電波の良い所で再度お試しください';
  return '接続エラー：' + m;
}
function sub(ref, ev, fn) { ref.on(ev, fn); net.subs.push(() => ref.off(ev, fn)); }

/* ---------- ロビー ---------- */
function onStatus(t) { $('on-status').textContent = t || ''; }
function openOnline() {
  $('on-menu').classList.remove('hidden');
  $('on-wait').classList.add('hidden');
  onStatus(window.FIREBASE_CONFIG ? '' : 'ネット対戦はまだ準備中です（Firebaseの設定が必要）');
  show('online');
}
function lobbyBusy(b) { $('on-create').disabled = b; $('on-join').disabled = b; }

async function createRoom() {
  lobbyBusy(true); onStatus('部屋を作っています…');
  try {
    await netInit();
    for (let i = 0; i < 10; i++) {
      const code = String(1000 + Math.floor(Math.random() * 9000));
      const ref = net.db.ref('rooms/' + code);
      const now = Date.now();
      let r;
      try {
        r = await ref.transaction(cur =>
          (cur === null || !cur.host || !cur.created || cur.created < now - ROOM_TTL) ? { host: net.uid, created: now } : undefined);
      } catch (e) {
        if (String(e.message || e).includes('ermission')) continue;   // 使用中のコード → 別のコードで再挑戦
        throw e;
      }
      if (!r.committed) continue;
      Object.assign(net, { role: 'host', side: 0, code, ref, round: 0, acked: 0 });
      ref.onDisconnect().remove();
      $('on-codebox').textContent = code;
      $('on-menu').classList.add('hidden');
      $('on-wait').classList.remove('hidden');
      onStatus('');
      sub(ref.child('guest'), 'value', s => { if (s.val() && !$('select').classList.contains('show') && !game) enterSelect(); });
      sub(ref.child('left/1'), 'value', s => { if (s.val()) netAbort('相手が部屋から出ました'); });
      sub(ref.child('decks'), 'value', s => onDecks(s.val()));
      sub(ref.child('cmds'), 'child_added', onCmd);
      return;
    }
    onStatus('部屋が混み合っています。もう一度お試しください');
  } catch (e) { onStatus(errText(e)); }
  finally { lobbyBusy(false); }
}

async function joinRoom() {
  const code = $('on-code').value.replace(/\D/g, '');
  if (code.length !== 4) { onStatus('4桁の部屋コードを入力してね'); return; }
  lobbyBusy(true); onStatus('部屋に入っています…');
  try {
    await netInit();
    const ref = net.db.ref('rooms/' + code);
    const s = await ref.get();
    const v = s.val();
    if (!v || !v.host || (v.created || 0) < Date.now() - ROOM_TTL) { onStatus('その部屋は見つかりません'); return; }
    if (v.guest && v.guest !== net.uid) { onStatus('その部屋はもう満員です'); return; }
    const r = await ref.child('guest').transaction(cur => (cur === null || cur === net.uid) ? net.uid : undefined);
    if (!r.committed) { onStatus('その部屋はもう満員です'); return; }
    Object.assign(net, { role: 'guest', side: 1, code, ref, round: 0, sentN: 0, sent: [] });
    ref.child('left/1').onDisconnect().set(true);
    onStatus('');
    sub(ref.child('host'), 'value', h => { if (!h.val()) netAbort('相手が部屋を閉じました'); });
    sub(ref.child('decks'), 'value', d => onDecks(d.val()));
    sub(ref.child('snap'), 'value', d => { const t = d.val(); if (t) applySnap(JSON.parse(t)); });
    enterSelect();
  } catch (e) { onStatus(errText(e)); }
  finally { lobbyBusy(false); }
}

function enterSelect() {
  setup.mode = 'online';
  openSelect(net.side);
}

function netSubmitDeck(deck) {
  $('sel-wait-sub').textContent = '部屋コード ' + net.code;
  $('sel-wait').classList.remove('hidden');
  net.ref.child('decks/' + net.side).set(deck).catch(e => onStatus(errText(e)));
}

function onDecks(d) {
  if (!d) return;
  const d0 = d[0] || d['0'], d1 = d[1] || d['1'];
  if (!d0 || !d1) return;
  net.decks = [d0, d1];
  setup.decks = [d0.slice(), d1.slice()];
  if (net.role === 'host' && !game) netStartRound();
}

/* ---------- ホスト側 ---------- */
function netStartRound() {
  net.round++;
  net.sentOver = false; net.fxOut = []; net.sendT = 0;
  setup.decks = [net.decks[0].slice(), net.decks[1].slice()];
  net.ref.child('created').set(Date.now()).catch(() => {});   // 使用中の部屋が期限切れ扱いにならないよう更新
  startBattle();
  netTick(0);
}

function onCmd(s) {
  const c = s.val();
  s.ref.remove();
  if (!c || !game || net.role !== 'host') return;
  net.acked = Math.max(net.acked, c.n || 0);
  if (game.players[1].deck.includes(c.id) && [0, 1, 2].includes(c.lane)) deploy(1, c.id, c.lane);
}

function netFx(f) {
  if (net.fxOut.length > 60) return;
  const o = {};
  for (const k in f) {
    const v = f[k];
    if (v === undefined) continue;
    o[k] = typeof v === 'number' ? Math.round(v * 10) / 10 : v;
  }
  net.fxOut.push(o);
}

function netTick(dt) {
  if (!net.ref || !game) return;
  net.sendT -= dt;
  if (net.sendT > 0) return;
  net.sendT = SNAP_SEC;
  if (game.over && net.sentOver) return;
  if (game.over) net.sentOver = true;
  const g = game, r1 = v => Math.round(v * 10) / 10;
  const snap = {
    r: net.round, t: r1(g.time), c: r1(g.countdown), ot: g.ot ? 1 : 0, o: g.over ? 1 : 0, a: net.acked,
    g: g.players.map(p => r1(p.gauge)), h: g.players.map(p => Math.ceil(p.baseHp)),
    u: g.units.map(u => [u.uid, u.id, u.side, u.lane, r1(u.x), r1(u.y), Math.ceil(u.hp),
      (u.stun > 0 ? 1 : 0) | (u.moving ? 2 : 0) | (u.atkAnim > 0.08 ? 4 : 0)]),
    fx: net.fxOut.splice(0),
  };
  net.ref.child('snap').set(JSON.stringify(snap)).catch(() => {});
}

/* ---------- ゲスト側 ---------- */
function netRequestDeploy(id, lane) {
  const p = game.players[net.side], c = CHAR[id];
  if (game.over || game.countdown > 0 || p.gauge < c.cost) return false;
  const n = ++net.sentN;
  net.sent.push({ n, cost: c.cost });
  p.gauge -= c.cost;
  net.ref.child('cmds').push({ id, lane, n }).catch(() => {});
  return true;
}

function applySnap(s) {
  if (!net.decks[0] || !net.decks[1]) return;
  if (s.r !== net.round) {                         // 新しい試合が始まった
    net.round = s.r; net.sent = [];
    setup.decks = [net.decks[0].slice(), net.decks[1].slice()];
    startBattle();
  }
  if (!game) return;
  const g = game;
  if (!g.go && s.c <= 0 && !s.o) { g.go = true; banner('出陣じゃ！'); }
  if (!g.ot && s.ot) { g.ot = true; banner('残業タイム！ ゲージ2倍'); }
  g.countdown = s.c; g.time = s.t;
  net.sent = net.sent.filter(x => x.n > s.a);
  const pending = net.sent.reduce((a, x) => a + x.cost, 0);
  g.players.forEach((p, i) => {
    if (s.h[i] < p.baseHp) g.shake = Math.min(6, g.shake + 1.5);
    p.baseHp = s.h[i];
    p.gauge = Math.max(0, s.g[i] - (i === net.side ? pending : 0));
  });
  const old = new Map(g.units.map(u => [u.uid, u]));
  const next = [];
  for (const [uid, id, side, lane, x, y, hp, fl] of s.u) {
    let u = old.get(uid);
    if (u) old.delete(uid);
    else {
      const c = CHAR[id];
      u = { uid, id, c, side, lane, x, y, hp, maxHp: c.hp, stun: 0, flash: 0, atkAnim: 0, t: Math.random() * 5, moving: false };
    }
    if (hp < u.hp) u.flash = 0.12;
    u.hp = hp; u.tx = x; u.ty = y;
    u.stun = fl & 1 ? 1 : 0; u.moving = !!(fl & 2);
    if (fl & 4) u.atkAnim = 0.18;
    next.push(u);
  }
  for (const u of old.values()) addFx({ type: 'puff', x: u.x, y: u.y - 14, life: 0.5 });
  g.units = next;
  for (const f of s.fx) addFx(f);
  if (s.o && !g.over) endGame();
}

function guestUpdate(dt) {
  const g = game;
  g.t += dt;
  g.shake = Math.max(0, g.shake - dt * 20);
  if (!g.over) {
    if (g.countdown > 0) {
      g.countdown = Math.max(0, g.countdown - dt);
      if (g.countdown <= 0 && !g.go) { g.go = true; banner('出陣じゃ！'); }
    } else g.time = Math.max(0, g.time - dt);
  }
  const k = Math.min(1, dt * 12);
  for (const u of g.units) {
    u.t += dt;
    u.flash = Math.max(0, u.flash - dt);
    u.atkAnim = Math.max(0, u.atkAnim - dt);
    if (u.tx != null) { u.x += (u.tx - u.x) * k; u.y += (u.ty - u.y) * k; }
  }
  updateFx(dt);
}

/* ---------- 退出 ---------- */
function netCleanup() {
  net.subs.forEach(f => f()); net.subs = [];
  if (net.ref) {
    const ref = net.ref;
    if (net.role === 'host') { ref.onDisconnect().cancel(); ref.remove().catch(() => {}); }
    else if (net.role === 'guest') { ref.child('left/1').onDisconnect().cancel(); ref.child('left/1').set(true).catch(() => {}); }
  }
  Object.assign(net, { role: null, code: null, ref: null, decks: [null, null], round: 0, sent: [], fxOut: [] });
}
function netLeave() {
  netCleanup();
  game = null; viewFlip = false; setup.mode = 'com';
  $('sel-wait').classList.add('hidden');
  $('result').classList.add('hidden');
  show('title'); drawTriArt();
}
function netAbort(msg) {
  if (!net.role) return;
  netLeave();
  modal(`<h3>${msg}</h3><p>ネット対戦を終了しました。</p>`);
}

/* ---------- ボタン ---------- */
$('btn-net').onclick = openOnline;
$('on-create').onclick = createRoom;
$('on-join').onclick = joinRoom;
$('on-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
$('on-back').onclick = () => { if (net.role) netLeave(); else show('title'); };
$('sel-wait-leave').onclick = netLeave;
