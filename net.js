'use strict';
/* =========================================================
   ネット対戦（Firebase Realtime Database）
   ・部屋を作った人（ホスト）＝P1 が試合を計算し、状態を0.1秒ごとに送る
   ・参加した人（ゲスト）＝P2 は「どのキャラをどのルートに出すか」だけを送る
   データ構造： rooms/{4桁コード} = { host, guest, created, decks:{0,1}, snap, cmds, left }
              lobby/{4桁コード} = { host, t }（対戦相手を待っている部屋）
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
  try { net.offset = (await net.db.ref('.info/serverTimeOffset').once('value')).val() || 0; } catch (e) { net.offset = 0; }
}
function errText(e) {
  const m = String(e && (e.code || e.message) || e);
  if (m === 'NOCONFIG') return 'ネット対戦はまだ準備中です（Firebaseの設定が必要）';
  if (m.includes('admin-restricted') || m.includes('operation-not-allowed')) return 'Firebaseの匿名ログインが有効になっていません';
  if (m.toLowerCase().includes('permission')) return 'Firebaseのルール設定を確認してください';
  if (m === 'script' || m.includes('network')) return '通信できませんでした。電波の良い所で再度お試しください';
  return '接続エラー：' + m;
}
function sub(ref, ev, fn) { ref.on(ev, fn); net.subs.push(() => ref.off(ev, fn)); }

/* ---------- 待合室（ランダムマッチ） ----------
   lobby/{部屋コード} = { host, t }  … 対戦相手を待っている部屋の一覧
   1) 待っている人がいれば、いちばん古い部屋に入る
   2) いなければ自分が部屋を作って待合室に登録し、最大5分待つ
   3) 待っている間も3秒ごとに自分より前から待っている人を探し、見つかればそちらへ合流（同時に入室した2人のすれ違い防止） */
const MATCH_MAX = 5 * 60 * 1000;
const SCAN_SEC = 3000;
let mm = null;   // 待合室の状態 { start, active, tick, scan, myT, busy }

function serverNow() { return Date.now() + (net.offset || 0); }
function onStatus(t) { $('on-status').textContent = t || ''; }
function fmt(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

function lobbyUI(state) {
  $('on-searching').classList.toggle('hidden', state !== 'search');
  $('on-timeout').classList.toggle('hidden', state !== 'timeout');
}

function openOnline() {
  onStatus('');
  $('on-count').textContent = '0:00';
  $('on-left').textContent = 'あと ' + fmt(MATCH_MAX);
  $('on-bar').style.width = '0%';
  $('on-msg').textContent = '対戦相手をさがしています…';
  lobbyUI('search');
  show('online');
  startMatch();
}

async function startMatch() {
  stopMatch();
  const me = mm = { start: Date.now(), active: true, busy: false };
  me.tick = setInterval(updateCount, 250);
  updateCount();
  lobbyUI('search');
  onStatus('');
  try {
    await netInit();
    if (!me.active) return;
    if (await tryJoinWaiting(null)) return;
    if (!me.active) return;
    await createWaitingRoom();
    me.scan = setInterval(scanWhileWaiting, SCAN_SEC);
  } catch (e) {
    onStatus(errText(e));
    stopMatch(); netCleanup();
    $('on-msg').textContent = '接続できませんでした';
  }
}

function updateCount() {
  if (!mm || !mm.active) return;
  const el = Date.now() - mm.start;
  $('on-count').textContent = fmt(el);
  $('on-left').textContent = 'あと ' + fmt(MATCH_MAX - el);
  $('on-bar').style.width = Math.min(100, el / MATCH_MAX * 100) + '%';
  if (el >= MATCH_MAX) matchTimeout();
}

function stopMatch() {
  if (!mm) return;
  mm.active = false;
  clearInterval(mm.tick); clearInterval(mm.scan);
  mm = null;
}

function matchTimeout() {
  stopMatch();
  netCleanup();
  lobbyUI('timeout');
}

function cancelMatch() {
  stopMatch();
  netCleanup();
  show('title'); drawTriArt();
}

async function findWaiting() {
  const s = await net.db.ref('lobby').orderByChild('t').limitToFirst(10).get();
  const list = [];
  s.forEach(c => { const v = c.val(); if (v) list.push({ code: c.key, host: v.host, t: v.t }); });
  const now = serverNow();
  return list.filter(e => e.host !== net.uid && e.t > now - MATCH_MAX);
}

// 待っている部屋に入る。olderThan を指定すると、それより前から待っている部屋だけが対象
async function tryJoinWaiting(olderThan) {
  let list = await findWaiting();
  if (olderThan) list = list.filter(e => e.t < olderThan.t || (e.t === olderThan.t && e.code < olderThan.code));
  for (const e of list) {
    if (!mm || !mm.active) return true;
    if (await joinCode(e.code)) return true;
  }
  return false;
}

async function joinCode(code) {
  const ref = net.db.ref('rooms/' + code);
  const v = (await ref.get()).val();
  if (!v || !v.host || v.guest || v.host === net.uid) return false;
  let r;
  try { r = await ref.child('guest').transaction(cur => cur === null ? net.uid : undefined); }
  catch (e) { return false; }
  if (!r.committed || r.snapshot.val() !== net.uid) return false;
  const v2 = (await ref.get()).val();
  if (!v2 || !v2.host) { ref.remove().catch(() => {}); return false; }   // 相手がちょうど退出していた
  net.db.ref('lobby/' + code).remove().catch(() => {});
  Object.assign(net, { role: 'guest', side: 1, code, ref, round: 0, sentN: 0, sent: [] });
  ref.child('left/1').onDisconnect().set(true);
  sub(ref.child('host'), 'value', h => { if (!h.val()) netAbort('相手が退出しました'); });
  sub(ref.child('decks'), 'value', d => onDecks(d.val()));
  sub(ref.child('snap'), 'value', d => { const t = d.val(); if (t) applySnap(JSON.parse(t)); });
  onMatched();
  return true;
}

async function createWaitingRoom() {
  for (let i = 0; i < 10; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const ref = net.db.ref('rooms/' + code);
    const now = serverNow();
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
    const lref = net.db.ref('lobby/' + code);
    net.lobbyRef = lref;
    if (mm) mm.myT = now;
    await lref.set({ host: net.uid, t: now });
    lref.onDisconnect().remove();
    sub(ref.child('guest'), 'value', s => { if (s.val() && net.role === 'host' && mm && mm.active) onMatched(); });
    sub(ref.child('left/1'), 'value', s => { if (s.val()) netAbort('相手が退出しました'); });
    sub(ref.child('decks'), 'value', s => onDecks(s.val()));
    sub(ref.child('cmds'), 'child_added', onCmd);
    return;
  }
  throw new Error('混み合っています。もう一度お試しください');
}

async function scanWhileWaiting() {
  const me = mm;
  if (!me || !me.active || me.busy || net.role !== 'host') return;
  me.busy = true;
  try {
    const mine = { t: me.myT, code: net.code };
    let older = (await findWaiting()).filter(e => e.code !== mine.code && (e.t < mine.t || (e.t === mine.t && e.code < mine.code)));
    if (!me.active) return;
    if (older.length) {
      // 自分より前から待っている人がいる → 自分の部屋をたたんで合流する
      await net.lobbyRef.remove();
      if ((await net.ref.child('guest').get()).val()) { onMatched(); return; }   // その間に誰かが入ってきた
      netCleanup();
      if (await tryJoinWaiting(mine)) return;
      if (me.active) await createWaitingRoom();   // 合流できなかったら待ち直し（経過時間はそのまま）
    } else if (net.lobbyRef && !(await net.lobbyRef.get()).exists() && !(await net.ref.child('guest').get()).val()) {
      await net.lobbyRef.set({ host: net.uid, t: me.myT });   // 一覧から消えていたら登録し直す
    }
  } catch (e) { /* 次の周期で再試行 */ }
  finally { me.busy = false; }
}

function onMatched() {
  if (!mm) return;
  stopMatch();
  if (net.role === 'host' && net.lobbyRef) {
    net.lobbyRef.onDisconnect().cancel();
    net.lobbyRef.remove().catch(() => {});
    net.lobbyRef = null;
  }
  $('on-msg').textContent = '対戦相手が見つかりました！';
  setTimeout(enterSelect, 600);
}

function enterSelect() {
  if (!net.role) return;
  setup.mode = 'online';
  openSelect(net.side);
}

function netSubmitDeck(deck) {
  $('sel-wait-sub').textContent = '';
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
  net.ref.child('created').set(serverNow()).catch(() => {});   // 使用中の部屋が期限切れ扱いにならないよう更新
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
  if (net.lobbyRef) { net.lobbyRef.onDisconnect().cancel(); net.lobbyRef.remove().catch(() => {}); net.lobbyRef = null; }
  if (net.ref) {
    const ref = net.ref;
    if (net.role === 'host') { ref.onDisconnect().cancel(); ref.remove().catch(() => {}); }
    else if (net.role === 'guest') { ref.child('left/1').onDisconnect().cancel(); ref.child('left/1').set(true).catch(() => {}); }
  }
  Object.assign(net, { role: null, code: null, ref: null, decks: [null, null], round: 0, sent: [], fxOut: [] });
}
function netLeave() {
  stopMatch();
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
$('on-cancel').onclick = cancelMatch;
$('on-retry').onclick = startMatch;
$('on-com').onclick = () => { setup.mode = 'com'; openSelect(0); };
$('on-back').onclick = () => { show('title'); drawTriArt(); };
$('sel-wait-leave').onclick = netLeave;
