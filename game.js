'use strict';
/* =========================================================
   出陣！戦国リーマン  — サラリーマン×戦国 レーン対戦ゲーム
   ========================================================= */

/* ---------- 定数 ---------- */
const W = 360, H = 560, MID = H / 2;
const LANES = [70, 180, 290];            // 3ルートのx座標（左・中・右 ※P1視点）
const BASE_FRONT = [H - 62, 62];         // 拠点の正面ライン [P1(下), P2(上)]
const SPAWN_Y = [H - 80, 80];
const TOWER_Y = [H - 175, 175];
const DIR = [-1, 1];                     // 進軍方向
const TEAM = [
  { main: '#2f7de1', dark: '#174a94', name: 'P1' },
  { main: '#e23b3b', dark: '#8e1d1d', name: 'P2' },
];
const MATCH_TIME = 60;                   // 1試合60秒
const OVERTIME_AT = 20;                  // 残り20秒で「残業タイム」ゲージ2倍
const GAUGE_MAX = 10, GAUGE_START = 5, GAUGE_SEC = 1.5;
const BASE_HP = 1000;
const BASE_GUN = { atk: 12, range: 105, rate: 0.9 };   // 拠点の火縄銃（自衛射撃）

/* ---------- 三すくみ ---------- */
const TYPES = {
  sala: { name: 'サラリーマン', short: 'リーマン', color: '#3b6fd1', beats: 'tube' },
  tube: { name: 'YouTuber', short: 'YouTuber', color: '#e0483e', beats: 'con' },
  con:  { name: 'コンサル', short: 'コンサル', color: '#8a4fd6', beats: 'sala' },
  none: { name: '無属性', short: '無属性', color: '#3f9e5a', beats: null },
};
function affinity(att, def) {
  if (TYPES[att].beats === def) return 1.5;   // 有利
  if (TYPES[def].beats === att) return 0.75;  // 不利
  return 1;
}

/* ---------- キャラクター（全8種） ---------- */
const CHARS = [
  { id: 'hira', name: 'ヒラ社員', sub: '足軽サラリーマン', type: 'sala', role: '近接・集団',
    cost: 3, hp: 95, atk: 13, range: 20, speed: 34, rate: 0.8, count: 3, size: 30,
    desc: '低コストで3体同時に出撃。長傘を突き出して前進！',
    design: '新入りのヒラ社員で、足軽。紺色のスーツに赤いネクタイ、頭には足軽の陣笠（じんがさ）。槍のように長い黒い傘を両手で構えて前に突き出している。まじめだけど少し頼りない笑顔。' },
  { id: 'kikaku', name: '企画系YouTuber', sub: '忍者', type: 'tube', role: '近接・奇襲',
    cost: 3, hp: 120, atk: 17, range: 20, speed: 72, rate: 0.45, size: 32,
    desc: '機動力がとても高い。自撮り棒クナイで素早く連撃。',
    design: '企画系YouTuberの忍者。赤い忍装束とパーカーが合体した服、口元は忍者マスク、額に赤いハチマキと小型ヘッドセット。先端がクナイになった自撮り棒を持ち、スマホを掲げて走るポーズ。ノリがよくやんちゃな表情。' },
  { id: 'partner', name: 'パートナーコンサル', sub: '総大将軍師', type: 'con', role: '超遠距離・貫通',
    cost: 6, hp: 190, atk: 42, range: 160, speed: 20, rate: 2.4, pierce: true, size: 38,
    desc: '高コスト・長射程。直線上の敵をまとめて貫く「カタカナ語ビーム」。',
    design: 'ベテランのパートナーコンサルで、総大将の軍師。紫色の高級スーツの上に金の刺繍入りの陣羽織、細いメガネ、大きな三日月の前立ての兜。手には軍配（うちわ）の形をしたタブレット。自信満々のドヤ顔で、背後に紫の光のオーラ。' },
  { id: 'kacho', name: '課長', sub: '重装歩兵', type: 'sala', role: '近接・タンク',
    cost: 5, hp: 600, atk: 16, range: 22, speed: 22, rate: 1.2, size: 40,
    desc: '高HPの壁役。持ち運びデスクを盾に味方を守る。',
    design: '中間管理職の課長で、重装歩兵。紺色の鎧とスーツが合体した服、兜の前立てはネクタイの形。大きな木製の事務デスクを盾のように前に構えている。少し疲れているけど頼れる渋い顔、ややぽっちゃり体型。' },
  { id: 'gadget', name: 'ガジェット系YouTuber', sub: 'からくり師', type: 'tube', role: '空中・範囲攻撃',
    cost: 5, hp: 190, atk: 24, range: 75, speed: 36, rate: 1.5, splash: 38, flying: true, size: 34,
    desc: 'ドローンで浮遊。カメラのレーザーで地上を範囲攻撃。',
    design: 'ガジェット系YouTuberで、からくり師。赤とメタリックシルバーのテックウェアに、額に大きなゴーグル。頭上の4枚羽ドローンにぶら下がって宙に浮いている。手にはレンズが光るカメラ。好奇心いっぱいのキラキラした笑顔。' },
  { id: 'shinsotsu', name: '新卒コンサル', sub: '下級陰陽師', type: 'con', role: '遠距離・単体',
    cost: 3, hp: 85, atk: 21, range: 115, speed: 30, rate: 1.1, size: 30,
    desc: '低コストの遠距離手。プレゼン資料（呪符）を投げる。',
    design: '新卒コンサルで、見習い陰陽師。紫のリクルートスーツに陰陽師の黒い烏帽子（えぼし）、首から社員証。グラフが描かれたプレゼン資料を呪符のように扇状に持ち、投げようとしているポーズ。緊張気味だけどやる気のある表情。' },
  { id: 'bengoshi', name: '奉行弁護士', sub: 'お吟味役', type: 'none', role: '単体高火力・拘束',
    cost: 4, hp: 230, atk: 48, range: 65, speed: 30, rate: 1.7, stun: 1.4, bigTarget: true, size: 34,
    desc: '大型ユニットを優先して狙い「異議あり！」で行動不能に。',
    design: '奉行所の弁護士で、お吟味役。緑と金色の裃（かみしも）風のスーツ、胸に金色のひまわりバッジ、ちょんまげ。片手で前を力強く指さして叫んでいるポーズ、もう片方の手に分厚い巻物の法律書。キリッとした自信の表情。' },
  { id: 'engineer', name: '刀鍛冶エンジニア', sub: '城大工', type: 'none', role: '設置・防衛',
    cost: 4, building: true, hp: 420, atk: 17, range: 110, speed: 0, rate: 0.75, life: 28, size: 40,
    desc: 'レーンに「サーバー城」を築城。近づく敵を自動迎撃（約28秒）。',
    design: '刀鍛冶のエンジニアで、城大工。緑の作業着にねじりハチマキ、首にヘッドホン。光るキーボードが付いた大きな木槌（ハンマー）を肩にかついでいる。足元に小さなサーバーラック。職人気質の頼もしい笑顔。' },
];
const CHAR = Object.fromEntries(CHARS.map(c => [c.id, c]));

const DIFFS = {
  easy:   { label: 'やさしい', think: 1.7, rate: 0.8,  smart: false, pushAt: 9.5 },
  normal: { label: 'ふつう',   think: 1.0, rate: 1.0,  smart: true,  pushAt: 8 },
  hard:   { label: 'つよい',   think: 0.45, rate: 1.12, smart: true, pushAt: 6.5 },
};

/* ---------- Gemini用 キャラデザ指示 ---------- */
const GEMINI_COMMON =
`【共通スタイル】
スマホ向け対戦ゲームのキャラクターイラストを作ってください。
・テーマ：「サラリーマン × 戦国武将」。スーツ・ネクタイ・スマホなど現代のビジネス要素と、兜・鎧・陣羽織など戦国の要素をミックス
・かわいい2頭身（SD）のデフォルメ体型、頭が大きく丸い
・ポップでカラフルなスマホゲーム風、太めのくっきりした輪郭線、セル塗り（アニメ塗り）
・全身が画面に収まる、正面〜やや斜め前向き、足元までしっかり描く
・背景は透明（透明が無理なら真っ白の単色）、影や地面は描かない
・正方形 1024×1024px、キャラは中央に大きく配置
・文字・ロゴ・吹き出しは入れない
・実在の人物には似せない
・シリーズで統一感のある同じ画風で描く`;
const GEMINI_TYPECOLOR = { sala: '青・紺', tube: '赤', con: '紫', none: '緑・金' };
const GEMINI_EXTRA = [
  { id: 'base', name: '拠点「本丸オフィス城」', design: '石垣の上に建つ、日本の城の天守閣とガラス張りのオフィスビルが合体した建物。瓦屋根の上に金のしゃちほこ、窓から明かりがもれている。少し上から見下ろしたゲーム用の建物イラスト。', size: '横長 1024×512px' },
  { id: 'tower', name: '設置物「サーバー城」', design: '小さな櫓（やぐら）の形をしたサーバーラック。前面にLEDランプが緑と青に光り、屋根は瓦、側面からケーブルが出ている。少し上から見下ろしたゲーム用の建物イラスト。', size: '正方形 1024×1024px' },
];
function geminiPrompt(c) {
  if (c.size) return `${GEMINI_COMMON.replace('正方形 1024×1024px、キャラは中央に大きく配置', c.size + '、建物は中央に大きく配置')}\n\n【描いてほしいもの】${c.name}\n${c.design}`;
  return `${GEMINI_COMMON}\n\n【キャラクター】${c.name}（${c.sub}）\n・職種：${TYPES[c.type].name}（${c.role}）\n・イメージカラー：${GEMINI_TYPECOLOR[c.type]}\n・デザイン：${c.design}`;
}

/* ---------- 画像読み込み（img/<id>.png があれば自動で差し替え） ---------- */
const IMG = {};
const ICON = {};
function loadImages() {
  for (const id of CHARS.map(c => c.id).concat(['base', 'tower'])) {
    const im = new Image();
    im.onload = () => { IMG[id] = im; };
    im.src = 'img/' + id + '.png';
  }
}
function makeIcons() {
  for (const c of CHARS) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 120;
    const x = cv.getContext('2d');
    drawSD(x, c, 60, c.flying ? 128 : 112, 96, null, 0.3, true);
    ICON[c.id] = cv.toDataURL();
  }
}
function charImg(id, cls) {
  const img = document.createElement('img');
  if (cls) img.className = cls;
  img.alt = CHAR[id].name;
  img.src = 'img/' + id + '.png';
  img.onerror = () => { img.onerror = null; img.src = ICON[id]; };
  return img;
}

/* ---------- 描画ユーティリティ ---------- */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); }

/* 仮キャラ（SD）を手描き。画像が用意されたら置き換わる。(x,y)=足元 */
function drawSD(ctx, c, x, y, s, side, t, iconMode) {
  const tc = TYPES[c.type].color, dk = shade(tc, -0.4);
  const ink = '#2a1f2e', skin = '#ffdcb8';
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1, s * 0.035); ctx.strokeStyle = ink; ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // 旗指物（チームカラー）
  if (side != null) {
    ctx.beginPath(); ctx.moveTo(s * .2, -s * .3); ctx.lineTo(s * .2, -s * 1.12); ctx.stroke();
    ctx.fillStyle = TEAM[side].main; rr(ctx, s * .2, -s * 1.12, s * .24, s * .3, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; circle(ctx, s * .32, -s * .97, s * .06); ctx.fill();
  }
  // ドローン（ガジェット系）
  if (c.id === 'gadget') {
    const sp = Math.abs(Math.sin(t * 40)) * s * .14 + s * .04;
    ctx.fillStyle = '#555'; rr(ctx, -s * .2, -s * 1.12, s * .4, s * .09, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(200,230,255,.8)';
    for (const px of [-s * .3, s * .3]) { ctx.beginPath(); ctx.ellipse(px, -s * 1.14, sp, s * .03, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-s * .1, -s * 1.04); ctx.lineTo(-s * .12, -s * .88); ctx.moveTo(s * .1, -s * 1.04); ctx.lineTo(s * .12, -s * .88); ctx.stroke();
  }
  // 足
  ctx.fillStyle = '#2b2b3a';
  rr(ctx, -s * .17, -s * .13, s * .13, s * .13, 2); ctx.fill();
  rr(ctx, s * .04, -s * .13, s * .13, s * .13, 2); ctx.fill();
  // 胴（スーツ＋草摺）
  ctx.fillStyle = tc; rr(ctx, -s * .24, -s * .45, s * .48, s * .35, s * .1); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dk; ctx.fillRect(-s * .22, -s * .2, s * .44, s * .07);
  ctx.fillStyle = '#fff'; poly(ctx, [-s * .09, -s * .45, s * .09, -s * .45, 0, -s * .3]); ctx.fill();
  ctx.fillStyle = '#d9262c'; poly(ctx, [0, -s * .43, -s * .035, -s * .37, 0, -s * .27, s * .035, -s * .37]); ctx.fill();
  // 裃（弁護士）
  if (c.id === 'bengoshi') {
    ctx.fillStyle = '#e8c35a'; poly(ctx, [-s * .38, -s * .48, s * .38, -s * .48, s * .22, -s * .36, -s * .22, -s * .36]); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd23f'; circle(ctx, -s * .12, -s * .32, s * .045); ctx.fill(); ctx.stroke();
  }
  // 頭
  ctx.fillStyle = skin; circle(ctx, 0, -s * .67, s * .27); ctx.fill(); ctx.stroke();
  // 髪
  ctx.fillStyle = '#3a2a22';
  ctx.beginPath(); ctx.arc(0, -s * .69, s * .27, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill();
  // 顔
  ctx.fillStyle = ink;
  circle(ctx, -s * .09, -s * .63, s * .036); ctx.fill();
  circle(ctx, s * .09, -s * .63, s * .036); ctx.fill();
  ctx.fillStyle = 'rgba(255,120,130,.5)';
  ctx.beginPath(); ctx.ellipse(-s * .16, -s * .56, s * .05, s * .03, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * .16, -s * .56, s * .05, s * .03, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -s * .56, s * .045, 0.2, Math.PI - 0.2); ctx.stroke();

  // かぶり物
  const gold = '#ffcf4a';
  switch (c.id) {
    case 'hira': // 陣笠
      ctx.fillStyle = '#2f2f3a'; poly(ctx, [-s * .38, -s * .76, 0, -s * 1.0, s * .38, -s * .76]); ctx.fill(); ctx.stroke();
      ctx.fillStyle = gold; circle(ctx, 0, -s * .86, s * .04); ctx.fill(); break;
    case 'kikaku': // 忍頭巾＋マスク
      ctx.fillStyle = '#2a2a33'; ctx.beginPath(); ctx.arc(0, -s * .69, s * .28, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d9262c'; ctx.fillRect(-s * .28, -s * .78, s * .56, s * .06);
      ctx.fillStyle = '#2a2a33'; rr(ctx, -s * .22, -s * .58, s * .44, s * .13, 4); ctx.fill(); break;
    case 'partner': // 大兜＋三日月
      helmet(ctx, s, dk);
      ctx.strokeStyle = gold; ctx.lineWidth = s * .06;
      ctx.beginPath(); ctx.arc(0, -s * 1.02, s * .2, Math.PI * .15, Math.PI * .85, true); ctx.stroke();
      ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, s * .025);
      circle(ctx, -s * .09, -s * .63, s * .07); ctx.stroke(); circle(ctx, s * .09, -s * .63, s * .07); ctx.stroke();
      break;
    case 'kacho': // 兜＋ネクタイ前立て
      helmet(ctx, s, '#2d3f73');
      ctx.fillStyle = '#d9262c'; poly(ctx, [0, -s * .98, -s * .06, -s * 1.1, 0, -s * 1.2, s * .06, -s * 1.1]); ctx.fill(); ctx.stroke();
      break;
    case 'gadget': // ゴーグル
      ctx.fillStyle = '#9ad8ff';
      circle(ctx, -s * .1, -s * .8, s * .07); ctx.fill(); ctx.stroke(); circle(ctx, s * .1, -s * .8, s * .07); ctx.fill(); ctx.stroke(); break;
    case 'shinsotsu': // 烏帽子
      ctx.fillStyle = '#1f1f28'; poly(ctx, [-s * .16, -s * .86, -s * .05, -s * 1.18, s * .14, -s * 1.1, s * .16, -s * .86]); ctx.fill(); ctx.stroke(); break;
    case 'bengoshi': // ちょんまげ
      ctx.fillStyle = '#3a2a22'; rr(ctx, -s * .05, -s * 1.0, s * .1, s * .1, 3); ctx.fill(); break;
    case 'engineer': // ハチマキ＋ヘッドホン
      ctx.fillStyle = '#fff'; ctx.fillRect(-s * .27, -s * .8, s * .54, s * .07);
      ctx.fillStyle = '#d9262c'; circle(ctx, 0, -s * .765, s * .03); ctx.fill();
      ctx.fillStyle = '#444'; rr(ctx, -s * .33, -s * .7, s * .09, s * .15, 3); ctx.fill(); rr(ctx, s * .24, -s * .7, s * .09, s * .15, 3); ctx.fill();
      break;
  }
  // 持ち物
  ctx.lineWidth = Math.max(1, s * .035); ctx.strokeStyle = ink;
  switch (c.id) {
    case 'hira': // 長傘
      ctx.strokeStyle = '#111'; ctx.lineWidth = s * .06;
      ctx.beginPath(); ctx.moveTo(-s * .3, -s * .2); ctx.lineTo(-s * .12, -s * 1.15); ctx.stroke();
      ctx.lineWidth = s * .03; ctx.beginPath(); ctx.arc(-s * .36, -s * .2, s * .06, 0, Math.PI); ctx.stroke(); break;
    case 'kikaku': // 自撮り棒クナイ
      ctx.strokeStyle = '#777'; ctx.lineWidth = s * .04;
      ctx.beginPath(); ctx.moveTo(-s * .22, -s * .32); ctx.lineTo(-s * .44, -s * .95); ctx.stroke();
      ctx.fillStyle = '#ccd'; poly(ctx, [-s * .44, -s * .95, -s * .5, -s * 1.12, -s * .38, -s * .98]); ctx.fill();
      ctx.fillStyle = '#222'; ctx.save(); ctx.translate(-s * .4, -s * .82); ctx.rotate(-.35); rr(ctx, -s * .07, -s * .1, s * .14, s * .2, 2); ctx.fill(); ctx.restore(); break;
    case 'partner': // 軍配タブレット
      ctx.fillStyle = '#6a3aa8'; ctx.beginPath(); ctx.ellipse(-s * .36, -s * .55, s * .13, s * .16, -.3, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9ff'; ctx.beginPath(); ctx.ellipse(-s * .36, -s * .55, s * .07, s * .09, -.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * .3, -s * .4); ctx.lineTo(-s * .24, -s * .3); ctx.stroke(); break;
    case 'kacho': // 持ち運びデスク
      ctx.fillStyle = '#a0643a'; rr(ctx, -s * .36, -s * .34, s * .72, s * .28, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c98a55'; ctx.fillRect(-s * .34, -s * .33, s * .68, s * .06);
      ctx.fillStyle = '#6b3f22'; ctx.fillRect(-s * .06, -s * .22, s * .12, s * .03); break;
    case 'gadget': // カメラ
      ctx.fillStyle = '#333'; rr(ctx, -s * .42, -s * .44, s * .2, s * .14, 3); ctx.fill();
      ctx.fillStyle = '#6cf'; circle(ctx, -s * .32, -s * .37, s * .045); ctx.fill(); break;
    case 'shinsotsu': // プレゼン資料
      for (let i = 0; i < 2; i++) {
        ctx.save(); ctx.translate(-s * .34 + i * s * .07, -s * .45); ctx.rotate(-.4 + i * .3);
        ctx.fillStyle = '#fff'; ctx.fillRect(-s * .07, -s * .1, s * .14, s * .19); ctx.strokeRect(-s * .07, -s * .1, s * .14, s * .19);
        ctx.fillStyle = '#e0483e'; ctx.fillRect(-s * .04, -s * .0, s * .03, s * .06); ctx.fillStyle = '#3b6fd1'; ctx.fillRect(s * .01, -s * .04, s * .03, s * .1);
        ctx.restore();
      } break;
    case 'bengoshi': // 指さし
      ctx.strokeStyle = skin; ctx.lineWidth = s * .07;
      ctx.beginPath(); ctx.moveTo(-s * .2, -s * .38); ctx.lineTo(-s * .44, -s * .6); ctx.stroke();
      ctx.fillStyle = '#f3e6c4'; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, s * .03);
      rr(ctx, s * .22, -s * .4, s * .12, s * .2, 3); ctx.fill(); ctx.stroke(); break;
    case 'engineer': // 大槌
      ctx.strokeStyle = '#7a4a24'; ctx.lineWidth = s * .05;
      ctx.beginPath(); ctx.moveTo(-s * .22, -s * .25); ctx.lineTo(-s * .38, -s * .9); ctx.stroke();
      ctx.fillStyle = '#888'; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, s * .03);
      ctx.save(); ctx.translate(-s * .39, -s * .93); ctx.rotate(-.25); rr(ctx, -s * .14, -s * .08, s * .28, s * .16, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4f4'; ctx.fillRect(-s * .1, -s * .02, s * .2, s * .03); ctx.restore(); break;
  }
  if (iconMode && c.flying) { /* アイコンでは浮遊を表現しない */ }
  ctx.restore();

  function helmet(ctx, s, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -s * .72, s * .29, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(col, -0.3); rr(ctx, -s * .34, -s * .76, s * .68, s * .07, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffcf4a'; circle(ctx, 0, -s * .9, s * .045); ctx.fill();
  }
}

/* ---------- ゲーム状態 ---------- */
let game = null;
let uidSeq = 0;
const setup = { mode: 'com', diff: 'normal', decks: [[], []], picking: 0 };

function newGame() {
  const mk = (side) => ({
    side, deck: setup.decks[side].slice(), gauge: GAUGE_START, baseHp: BASE_HP, gunCd: 0,
    com: setup.mode === 'com' && side === 1, ai: DIFFS[setup.diff], aiT: 1.5,
    rateMul: setup.mode === 'com' && side === 1 ? DIFFS[setup.diff].rate : 1, sel: null,
  });
  game = { time: MATCH_TIME, countdown: 3.2, players: [mk(0), mk(1)], units: [], fx: [], over: false, shake: 0, ot: false, t: 0 };
}

function makeUnit(side, id, lane, dx, dy) {
  const c = CHAR[id];
  return {
    uid: ++uidSeq, side, id, c, lane, x: LANES[lane] + dx,
    y: (c.building ? TOWER_Y[side] : SPAWN_Y[side]) + dy,
    hp: c.hp, maxHp: c.hp, cd: 0.5, stun: 0, flash: 0, t: Math.random() * 5, atkAnim: 0, moving: false,
  };
}

function deploy(side, id, lane) {
  const p = game.players[side], c = CHAR[id];
  if (game.over || game.countdown > 0 || p.gauge < c.cost) return false;
  p.gauge -= c.cost;
  const n = c.count || 1;
  for (let i = 0; i < n; i++) {
    const dx = n > 1 ? (i - 1) * 13 : 0;
    const dy = n > 1 ? Math.abs(i - 1) * 8 * -DIR[side] : 0;
    game.units.push(makeUnit(side, id, lane, dx, dy));
  }
  const y = c.building ? TOWER_Y[side] : SPAWN_Y[side];
  addFx({ type: 'ring', x: LANES[lane], y, color: TEAM[side].main, life: 0.5 });
  addFx({ type: 'text', x: LANES[lane], y: y - 40, text: c.name + ' 出陣！', color: '#fff', life: 1, size: 11 });
  return true;
}

/* ---------- 更新 ---------- */
function update(dt) {
  const g = game;
  g.t += dt;
  g.shake = Math.max(0, g.shake - dt * 20);
  if (g.countdown > 0) {
    const before = Math.ceil(g.countdown);
    g.countdown -= dt;
    if (g.countdown <= 0) banner('出陣じゃ！');
    else if (Math.ceil(g.countdown) !== before) {}
    updateFx(dt);
    return;
  }
  if (g.over) { updateFx(dt); return; }

  g.time -= dt;
  if (!g.ot && g.time <= OVERTIME_AT) { g.ot = true; banner('残業タイム！ ゲージ2倍'); }
  const mul = g.ot ? 2 : 1;
  for (let s = 0; s < 2; s++) {
    const p = g.players[s];
    p.gauge = Math.min(GAUGE_MAX, p.gauge + dt / GAUGE_SEC * mul * p.rateMul);
    if (p.com) comThink(s, dt);
  }
  for (const u of g.units) updateUnit(u, dt);
  for (let s = 0; s < 2; s++) baseGun(s, dt);
  g.units = g.units.filter(u => {
    if (u.hp <= 0) { addFx({ type: 'puff', x: u.x, y: u.y - 14, life: 0.5 }); return false; }
    return true;
  });
  updateFx(dt);

  const [a, b] = g.players;
  if (a.baseHp <= 0 || b.baseHp <= 0 || g.time <= 0) { g.time = Math.max(0, g.time); endGame(); }
}

function updateUnit(u, dt) {
  const c = u.c;
  u.t += dt; u.flash = Math.max(0, u.flash - dt); u.atkAnim = Math.max(0, u.atkAnim - dt);
  if (c.building) u.hp -= c.hp / c.life * dt;            // サーバー城は時間で劣化
  if (u.stun > 0) { u.stun -= dt; u.moving = false; return; }
  u.cd -= dt;
  const target = findTarget(u);
  if (target) {
    u.moving = false;
    if (u.cd <= 0) { attack(u, target); u.cd = c.rate; }
    return;
  }
  const foe = 1 - u.side;
  if (Math.abs(u.y - BASE_FRONT[foe]) <= c.range + 4) {   // 拠点に到達 → 攻撃
    u.moving = false;
    if (u.cd <= 0) { attackBase(u, foe); u.cd = c.rate; }
    return;
  }
  if (c.building) return;
  u.moving = true;
  u.y += DIR[u.side] * c.speed * dt;
}

function findTarget(u) {
  const c = u.c;
  let best = null, bs = Infinity;
  for (const e of game.units) {
    if (e.side === u.side || e.hp <= 0) continue;
    let d;
    if (c.building) d = Math.hypot(e.x - u.x, e.y - u.y);
    else if (e.lane === u.lane) d = Math.abs(e.y - u.y);
    else continue;
    if (d > c.range + 8) continue;
    const score = c.bigTarget ? -e.maxHp + d * 0.01 : d;
    if (score < bs) { bs = score; best = e; }
  }
  return best;
}

function attack(u, t) {
  const c = u.c;
  u.atkAnim = 0.18;
  if (c.pierce) {                                  // カタカナ語ビーム（貫通）
    const y0 = u.y, y1 = u.y + DIR[u.side] * c.range;
    const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
    for (const e of game.units) if (e.side !== u.side && e.lane === u.lane && e.y >= lo && e.y <= hi) damage(u, e, c.atk);
    const foe = 1 - u.side;
    if (BASE_FRONT[foe] >= lo && BASE_FRONT[foe] <= hi) hitBase(foe, Math.round(c.atk * 0.6), u.x);
    const words = ['シナジー！', 'アジャイル！', 'エビデンス！', 'コミット！', 'ROI！', 'スキーム！'];
    addFx({ type: 'beam', x: u.x, y: u.y - 18, x2: u.x, y2: y1, life: 0.35, color: '#c77dff' });
    addFx({ type: 'text', x: u.x, y: u.y - 46, text: words[Math.floor(Math.random() * words.length)], color: '#e7c6ff', life: 0.9, size: 12 });
  } else if (c.splash) {                           // ドローンレーザー（範囲）
    for (const e of game.units) if (e.side !== u.side && Math.hypot(e.x - t.x, e.y - t.y) <= c.splash) damage(u, e, c.atk);
    addFx({ type: 'beam', x: u.x, y: u.y - 34, x2: t.x, y2: t.y - 10, life: 0.2, color: '#ff4d4d', w: 3 });
    addFx({ type: 'boom', x: t.x, y: t.y - 8, r: c.splash, life: 0.35, color: 'rgba(255,90,60,' });
  } else {
    damage(u, t, c.atk);
    if (c.stun) {
      t.stun = Math.max(t.stun, c.stun);
      addFx({ type: 'text', x: u.x, y: u.y - 48, text: '異議あり！', color: '#ffe14d', life: 1, size: 15 });
    }
    if (c.range > 40) addFx({ type: 'shot', x: u.x, y: u.y - 20, x2: t.x, y2: t.y - 14, life: 0.2, color: c.id === 'bengoshi' ? '#ffe14d' : '#fff' });
    else addFx({ type: 'slash', x: t.x, y: t.y - 14, life: 0.15 });
  }
}

function damage(src, e, base) {
  const m = affinity(src.c.type, e.c.type);
  const d = Math.round(base * m);
  e.hp -= d; e.flash = 0.12;
  addFx({ type: 'text', x: e.x + (Math.random() - .5) * 10, y: e.y - 36, text: String(d), color: m > 1 ? '#ffd23f' : m < 1 ? '#aab' : '#fff', life: 0.6, size: m > 1 ? 14 : 11 });
  if (m > 1 && Math.random() < 0.3) addFx({ type: 'text', x: e.x, y: e.y - 52, text: '有利！', color: '#ffd23f', life: 0.7, size: 12 });
}

function attackBase(u, foe) {
  u.atkAnim = 0.18;
  const c = u.c;
  if (c.range > 40) addFx({ type: c.pierce ? 'beam' : 'shot', x: u.x, y: u.y - 20, x2: u.x, y2: BASE_FRONT[foe], life: 0.2, color: c.pierce ? '#c77dff' : '#fff' });
  else addFx({ type: 'slash', x: u.x, y: BASE_FRONT[foe], life: 0.15 });
  hitBase(foe, c.atk, u.x);
}

function hitBase(side, dmg, x) {
  const p = game.players[side];
  p.baseHp = Math.max(0, p.baseHp - dmg);
  game.shake = Math.min(6, game.shake + 1.5);
  addFx({ type: 'text', x, y: BASE_FRONT[side] + (side === 0 ? 14 : -14), text: '-' + dmg, color: '#ff8a7a', life: 0.7, size: 13 });
}

function baseGun(s, dt) {
  const p = game.players[s];
  p.gunCd -= dt;
  if (p.gunCd > 0 || p.baseHp <= 0) return;
  let best = null, bd = Infinity;
  for (const e of game.units) {
    if (e.side === s) continue;
    const dy = s === 0 ? BASE_FRONT[0] - e.y : e.y - BASE_FRONT[1];
    if (dy < -20 || dy > BASE_GUN.range) continue;
    if (dy < bd) { bd = dy; best = e; }
  }
  if (!best) return;
  best.hp -= BASE_GUN.atk; best.flash = 0.1;
  addFx({ type: 'shot', x: best.x, y: BASE_FRONT[s], x2: best.x, y2: best.y - 14, life: 0.15, color: '#ffb347' });
  p.gunCd = BASE_GUN.rate;
}

/* ---------- COM思考 ---------- */
function comThink(side, dt) {
  const p = game.players[side], d = p.ai;
  p.aiT -= dt;
  if (p.aiT > 0) return;
  p.aiT = d.think * (0.6 + Math.random() * 0.8);
  const foe = 1 - side;
  const threat = [0, 0, 0], mine = [0, 0, 0], dom = [{}, {}, {}];
  const reach = H * 0.62;
  for (const u of game.units) {
    if (u.side === foe) {
      const dist = Math.abs(u.y - BASE_FRONT[side]);
      if (dist < reach) {
        threat[u.lane] += u.hp * (1.4 - dist / reach) + u.c.atk * 3;
        dom[u.lane][u.c.type] = (dom[u.lane][u.c.type] || 0) + u.hp;
      }
    } else mine[u.lane] += u.hp * (u.c.building ? 0.7 : 1);
  }
  const deck = p.deck.map(id => CHAR[id]);
  const afford = deck.filter(c => c.cost <= p.gauge);

  let lane = -1, worst = 50;
  for (let l = 0; l < 3; l++) { const net = threat[l] - mine[l] * 0.7; if (net > worst) { worst = net; lane = l; } }

  if (lane >= 0) {                                   // 防衛
    let dt_ = null, dv = 0;
    for (const k in dom[lane]) if (dom[lane][k] > dv) { dv = dom[lane][k]; dt_ = k; }
    const cands = d.smart ? deck : afford;
    let best = null, bs = -Infinity;
    for (const c of cands) {
      const sc = (d.smart && dt_ ? affinity(c.type, dt_) * 2 : 1) + (c.building ? 0.5 : 0) + c.cost * 0.12 + Math.random() * 0.6;
      if (sc > bs) { bs = sc; best = c; }
    }
    if (best && best.cost <= p.gauge) { deploy(side, best.id, lane); return; }
    if (worst > 220 && afford.length) deploy(side, afford[Math.floor(Math.random() * afford.length)].id, lane);
    return;
  }
  if (p.gauge >= d.pushAt && afford.length) {        // 攻撃
    const def = [0, 0, 0];
    for (const u of game.units) if (u.side === foe) def[u.lane] += u.hp;
    const ls = [0, 1, 2].map(l => ({ l, s: def[l] - mine[l] * 0.5 + Math.random() * 90 })).sort((a, b) => a.s - b.s);
    let pool = afford.filter(c => !c.building);
    if (!pool.length) pool = afford;
    const pick = pool.map(c => ({ c, s: c.cost + Math.random() * 3 })).sort((a, b) => b.s - a.s)[0].c;
    deploy(side, pick.id, ls[0].l);
  }
}

/* ---------- エフェクト ---------- */
function addFx(f) { f.t = 0; game.fx.push(f); }
function updateFx(dt) {
  for (const f of game.fx) f.t += dt;
  game.fx = game.fx.filter(f => f.t < f.life);
}

/* ---------- 描画 ---------- */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let scale = 1, dpr = 1;

function fitCanvas() {
  const wrap = document.getElementById('field-wrap');
  const r = wrap.getBoundingClientRect();
  if (!r.width || !r.height) return;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  scale = Math.min((r.width - 4) / W, (r.height - 4) / H);
  cv.style.width = W * scale + 'px';
  cv.style.height = H * scale + 'px';
  cv.width = Math.round(W * scale * dpr);
  cv.height = Math.round(H * scale * dpr);
}

function render() {
  if (!game) return;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.save();
  if (game.shake > 0) ctx.translate((Math.random() - .5) * game.shake, (Math.random() - .5) * game.shake);
  drawField();
  drawBase(1); drawBase(0);
  const list = game.units.slice().sort((a, b) => a.y - b.y);
  for (const u of list) drawUnit(u);
  drawFx();
  ctx.restore();
  drawOverlayText();
}

function drawField() {
  // 陣地（上：P2 / 下：P1）
  const g1 = ctx.createLinearGradient(0, 0, 0, H);
  g1.addColorStop(0, '#6f9a46'); g1.addColorStop(0.5, '#86b24f'); g1.addColorStop(1, '#6f9a46');
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(226,59,59,.08)'; ctx.fillRect(0, 0, W, MID);
  ctx.fillStyle = 'rgba(47,125,225,.08)'; ctx.fillRect(0, MID, W, MID);
  // 芝の模様
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  for (let i = 0; i < 14; i++) ctx.fillRect(0, i * 40, W, 20);
  // ルート（道）
  for (let l = 0; l < 3; l++) {
    ctx.fillStyle = '#c9a66b'; rr(ctx, LANES[l] - 22, 50, 44, H - 100, 10); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.06)';
    for (let y = 60; y < H - 60; y += 22) ctx.fillRect(LANES[l] - 14, y, 28, 3);
  }
  // 堀
  ctx.fillStyle = '#3f8fd1'; ctx.fillRect(0, MID - 13, W, 26);
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  for (let x = (game.t * 12) % 30 - 30; x < W; x += 30) ctx.fillRect(x, MID - 3, 14, 2);
  // 橋
  for (let l = 0; l < 3; l++) {
    ctx.fillStyle = '#8b5a2b'; ctx.fillRect(LANES[l] - 25, MID - 17, 50, 34);
    ctx.fillStyle = '#a8703a';
    for (let i = 0; i < 5; i++) ctx.fillRect(LANES[l] - 25, MID - 16 + i * 7, 50, 5);
    ctx.fillStyle = '#5a3a1a'; ctx.fillRect(LANES[l] - 27, MID - 17, 4, 34); ctx.fillRect(LANES[l] + 23, MID - 17, 4, 34);
  }
  // 松
  for (const [x, y] of [[125, 150], [235, 410], [18, 330], [342, 210], [125, 420], [235, 140]]) {
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x, y + 8, 12, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2f6b33'; circle(ctx, x, y - 4, 11); ctx.fill();
    ctx.fillStyle = '#3d8a41'; circle(ctx, x - 3, y - 7, 7); ctx.fill();
  }
}

function drawBase(side) {
  const p = game.players[side];
  const front = BASE_FRONT[side];
  const top = side === 0 ? front : 0, bot = side === 0 ? H : front;
  // 石垣
  ctx.fillStyle = '#8d8a84'; ctx.fillRect(0, top, W, bot - top);
  ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1;
  for (let y = top; y < bot; y += 10) for (let x = ((y / 10) % 2) * 12; x < W; x += 24) ctx.strokeRect(x, y, 24, 10);
  ctx.fillStyle = TEAM[side].main; ctx.fillRect(0, side === 0 ? front : front - 4, W, 4);
  // 本丸オフィス城
  const cy = (top + bot) / 2;
  if (IMG.base) {
    ctx.drawImage(IMG.base, 180 - 80, cy - 40, 160, 80);
  } else {
    ctx.save(); ctx.translate(180, cy + 4);
    ctx.fillStyle = '#eef3f8'; ctx.fillRect(-46, -14, 92, 30);
    ctx.fillStyle = '#7fb6e6';
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) ctx.fillRect(-40 + i * 14, -9 + j * 12, 9, 7);
    ctx.fillStyle = '#3a3f4f'; poly(ctx, [-58, -14, 58, -14, 40, -26, -40, -26]); ctx.fill();
    ctx.fillStyle = '#eef3f8'; ctx.fillRect(-28, -38, 56, 12);
    ctx.fillStyle = '#7fb6e6'; for (let i = 0; i < 4; i++) ctx.fillRect(-22 + i * 12, -35, 7, 6);
    ctx.fillStyle = '#3a3f4f'; poly(ctx, [-38, -38, 38, -38, 22, -50, -22, -50]); ctx.fill();
    ctx.fillStyle = '#ffcf4a'; circle(ctx, -18, -51, 3); ctx.fill(); circle(ctx, 18, -51, 3); ctx.fill();
    ctx.fillStyle = TEAM[side].main; ctx.fillRect(40, -60, 18, 12);
    ctx.fillStyle = '#553'; ctx.fillRect(38, -62, 2, 30);
    ctx.restore();
  }
  // 櫓（左右）
  for (const x of [30, 330]) {
    ctx.fillStyle = '#5b4a3a'; ctx.fillRect(x - 12, cy - 12, 24, 22);
    ctx.fillStyle = '#3a3f4f'; poly(ctx, [x - 16, cy - 12, x + 16, cy - 12, x, cy - 24]); ctx.fill();
  }
  if (p.baseHp <= 0) {
    ctx.fillStyle = 'rgba(30,20,20,.55)'; ctx.fillRect(0, top, W, bot - top);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('落城…', 180, cy + 6);
  }
  // HPバー
  const bw = 150, bx = 180 - bw / 2, by = side === 0 ? H - 12 : 3;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; rr(ctx, bx - 2, by - 1, bw + 4, 10, 4); ctx.fill();
  ctx.fillStyle = TEAM[side].main; rr(ctx, bx, by, bw * p.baseHp / BASE_HP, 8, 3); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(Math.ceil(p.baseHp) + ' / ' + BASE_HP, 180, by + 7);
}

function drawUnit(u) {
  const c = u.c;
  if (c.building) return drawTower(u);
  const s = c.size;
  const lunge = u.atkAnim > 0 ? DIR[u.side] * 3 : 0;
  const bob = u.moving ? -Math.abs(Math.sin(u.t * 10)) * 2 : 0;
  const fly = c.flying ? -16 + Math.sin(u.t * 4) * 2 : 0;
  // 影と足元リング
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(u.x, u.y, s * .32, s * .1, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = TEAM[u.side].main; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(u.x, u.y, s * .34, s * .12, 0, 0, 7); ctx.stroke();
  const fy = u.y + lunge + bob + fly;
  if (IMG[u.id]) {
    ctx.drawImage(IMG[u.id], u.x - s * .6, fy - s * 1.15, s * 1.2, s * 1.2);
    ctx.fillStyle = TEAM[u.side].main; rr(ctx, u.x + s * .3, fy - s * 1.1, 7, 9, 2); ctx.fill();
  } else {
    drawSD(ctx, c, u.x, fy, s, u.side, u.t);
  }
  if (u.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,.55)'; circle(ctx, u.x, fy - s * .55, s * .4); ctx.fill(); }
  if (u.stun > 0) {
    ctx.fillStyle = '#ffe14d'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('★拘束★', u.x, fy - s * 1.2);
  }
  hpBar(u.x, fy - s * 1.05 - 6, 26, u.hp / u.maxHp, u.side);
}

function drawTower(u) {
  const x = u.x, y = u.y;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y, 20, 6, 0, 0, 7); ctx.fill();
  if (IMG.tower) ctx.drawImage(IMG.tower, x - 24, y - 46, 48, 48);
  else {
    ctx.fillStyle = '#8d8a84'; rr(ctx, x - 18, y - 10, 36, 10, 2); ctx.fill();
    ctx.fillStyle = '#2d3140'; rr(ctx, x - 14, y - 36, 28, 27, 3); ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#444a5c'; ctx.fillRect(x - 11, y - 33 + i * 8, 22, 6);
      ctx.fillStyle = (Math.floor(u.t * 6) + i) % 2 ? '#4f4' : '#4cf'; ctx.fillRect(x + 5, y - 31 + i * 8, 3, 2);
    }
    ctx.fillStyle = '#3a3f4f'; poly(ctx, [x - 20, y - 36, x + 20, y - 36, x, y - 48]); ctx.fill();
    ctx.fillStyle = TEAM[u.side].main; ctx.fillRect(x - 20, y - 38, 40, 3);
  }
  if (u.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,.45)'; rr(ctx, x - 16, y - 46, 32, 44, 4); ctx.fill(); }
  hpBar(x, y - 54, 30, u.hp / u.maxHp, u.side);
}

function hpBar(x, y, w, r, side) {
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
  ctx.fillStyle = side === 0 ? '#5ab0ff' : '#ff6464';
  ctx.fillRect(x - w / 2, y, w * Math.max(0, r), 3);
}

function drawFx() {
  for (const f of game.fx) {
    const k = f.t / f.life;
    ctx.globalAlpha = 1 - k;
    switch (f.type) {
      case 'text':
        ctx.font = `bold ${f.size || 11}px "M PLUS Rounded 1c",sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
        ctx.strokeText(f.text, f.x, f.y - k * 16); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - k * 16);
        break;
      case 'beam':
        ctx.strokeStyle = f.color; ctx.lineWidth = (f.w || 7) * (1 - k * .5);
        ctx.shadowColor = f.color; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.shadowBlur = 0;
        break;
      case 'shot': {
        const px = f.x + (f.x2 - f.x) * Math.min(1, k * 1.6), py = f.y + (f.y2 - f.y) * Math.min(1, k * 1.6);
        ctx.fillStyle = f.color; circle(ctx, px, py, 3); ctx.fill();
        break;
      }
      case 'slash':
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, 9 + k * 4, -2.4, -0.6); ctx.stroke();
        break;
      case 'boom':
        ctx.fillStyle = f.color + (0.45 * (1 - k)) + ')'; circle(ctx, f.x, f.y, f.r * (0.4 + k * 0.6)); ctx.fill();
        break;
      case 'ring':
        ctx.strokeStyle = f.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, 10 + k * 26, 4 + k * 9, 0, 0, 7); ctx.stroke();
        break;
      case 'puff':
        ctx.fillStyle = '#ddd';
        for (let i = 0; i < 5; i++) { const a = i * 1.26; circle(ctx, f.x + Math.cos(a) * k * 16, f.y + Math.sin(a) * k * 10, 6 * (1 - k) + 2); ctx.fill(); }
        break;
    }
    ctx.globalAlpha = 1;
  }
}

function drawOverlayText() {
  const g = game;
  ctx.textAlign = 'center';
  // 残り時間（堀の右端）
  const t = Math.ceil(g.time);
  ctx.font = 'bold 13px "M PLUS Rounded 1c",sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(ctx, W - 50, MID - 11, 46, 22, 8); ctx.fill();
  ctx.fillStyle = g.ot ? '#ff8a7a' : '#ffcf4a';
  ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, W - 27, MID + 5);
  if (g.countdown > 0) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H);
    const n = Math.ceil(g.countdown);
    ctx.font = 'bold 72px "M PLUS Rounded 1c",sans-serif';
    ctx.lineWidth = 6; ctx.strokeStyle = '#5b1a12';
    const label = n > 3 ? '3' : String(n);
    ctx.strokeText(label, W / 2, MID + 25); ctx.fillStyle = '#fff'; ctx.fillText(label, W / 2, MID + 25);
    if (setup.mode === 'pvp') {
      ctx.save(); ctx.translate(W / 2, MID - 70); ctx.rotate(Math.PI);
      ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('P2 はこちら側から出陣', 0, 0); ctx.restore();
      ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('P1 はこちら側から出陣', W / 2, MID + 80);
    }
  }
}

/* ---------- 画面・UI ---------- */
const $ = id => document.getElementById(id);
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === id));
  if (id === 'battle') requestAnimationFrame(fitCanvas);
}
function banner(text) {
  const b = $('banner');
  b.textContent = text;
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
}

/* タイトルの三すくみ図 */
function drawTriArt() {
  const c = $('tri-art'), x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  const pts = [['hira', 220, 118], ['kikaku', 360, 300], ['shinsotsu', 80, 300]];
  x.strokeStyle = '#ffcf4a'; x.lineWidth = 5; x.fillStyle = '#ffcf4a';
  const arrow = (a, b) => {
    const [ax, ay] = [a[1], a[2] - 45], [bx, by] = [b[1], b[2] - 45];
    const ang = Math.atan2(by - ay, bx - ax), sx = ax + Math.cos(ang) * 70, sy = ay + Math.sin(ang) * 70;
    const ex = bx - Math.cos(ang) * 70, ey = by - Math.sin(ang) * 70;
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(ex, ey); x.stroke();
    x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex - Math.cos(ang - .5) * 16, ey - Math.sin(ang - .5) * 16);
    x.lineTo(ex - Math.cos(ang + .5) * 16, ey - Math.sin(ang + .5) * 16); x.closePath(); x.fill();
  };
  arrow(pts[0], pts[1]); arrow(pts[1], pts[2]); arrow(pts[2], pts[0]);
  for (const [id, px, py] of pts) {
    const im = IMG[id];
    if (im) x.drawImage(im, px - 55, py - 115, 110, 110);
    else drawSD(x, CHAR[id], px, py, 100, null, 0);
    x.font = 'bold 22px "M PLUS Rounded 1c",sans-serif'; x.textAlign = 'center';
    x.fillStyle = TYPES[CHAR[id].type].color; x.strokeStyle = '#fff'; x.lineWidth = 5;
    x.strokeText(TYPES[CHAR[id].type].short, px, py + 26); x.fillText(TYPES[CHAR[id].type].short, px, py + 26);
  }
}

/* キャラ選択 */
let picks = [];
function openSelect(side) {
  setup.picking = side;
  picks = loadDeck(side);
  const who = setup.mode === 'com' ? 'あなた' : TEAM[side].name;
  $('sel-title').innerHTML = `<span class="who" style="background:${TEAM[side].main}">${who}</span>3キャラを選べ！`;
  renderGrid();
  show('select');
}
function renderGrid() {
  const grid = $('grid');
  grid.innerHTML = '';
  for (const c of CHARS) {
    const b = document.createElement('button');
    b.className = 'cc' + (picks.includes(c.id) ? ' on' : '');
    b.innerHTML = `<span class="cost">${c.cost}</span><span class="num">${picks.indexOf(c.id) + 1}</span>
      <div class="top"></div>
      <div class="ds">${c.desc}</div>
      <div class="st">HP ${c.hp}／攻撃 ${c.atk}${c.count ? '×' + c.count + '体' : ''}／射程 ${c.range >= 100 ? '長' : c.range >= 50 ? '中' : '短'}</div>`;
    const top = b.querySelector('.top');
    top.appendChild(charImg(c.id));
    const info = document.createElement('div');
    info.innerHTML = `<div class="nm">${c.name}</div><div class="sb">${c.sub}</div>
      <span class="badge t-${c.type}">${TYPES[c.type].short}</span> <span class="sb">${c.role}</span>`;
    top.appendChild(info);
    b.onclick = () => {
      const i = picks.indexOf(c.id);
      if (i >= 0) picks.splice(i, 1);
      else if (picks.length < 3) picks.push(c.id);
      else { picks.shift(); picks.push(c.id); }
      renderGrid();
    };
    grid.appendChild(b);
  }
  $('sel-ok').disabled = picks.length !== 3;
  $('sel-ok').textContent = `出陣（${picks.length}/3）`;
}
function randomDeck() {
  const by = t => CHARS.filter(c => c.type === t).map(c => c.id);
  const pickOne = a => a[Math.floor(Math.random() * a.length)];
  const d = [pickOne(by('sala')), pickOne(by('tube')), pickOne(by('con'))];
  if (Math.random() < 0.45) d[Math.floor(Math.random() * 3)] = pickOne(by('none'));
  return d;
}
function loadDeck(side) {
  try { const d = JSON.parse(localStorage.getItem('sengoku-deck-' + side)); if (Array.isArray(d) && d.every(id => CHAR[id])) return d.slice(0, 3); } catch (e) {}
  return [];
}
function saveDeck(side, d) { try { localStorage.setItem('sengoku-deck-' + side, JSON.stringify(d)); } catch (e) {} }

/* バトル画面のパネル */
const panels = [null, null];
function buildPanel(side) {
  const el = $('panel' + side);
  const p = game.players[side];
  el.className = `panel ${side === 0 ? 'bottom' : 'top'} p${side}`;
  if (p.com) {
    el.className = `panel p1 com`;
    el.innerHTML = `<div class="p-head" style="width:100%"><span class="p-name">COM</span><span class="p-hp">${DIFFS[setup.diff].label}</span><span class="p-timer"></span></div>`;
    panels[side] = { el, timer: el.querySelector('.p-timer'), com: true };
    return;
  }
  const name = setup.mode === 'com' ? 'あなた' : TEAM[side].name;
  el.innerHTML = `
    <div class="p-head"><span class="p-name">${name}</span><span class="p-hint">キャラ → ルートの順にタップ</span><span class="p-hp"></span><span class="p-timer"></span></div>
    <div class="lanes">
      <button class="lane" data-i="0">◀ 左</button><button class="lane" data-i="1">▲ 中</button><button class="lane" data-i="2">右 ▶</button>
    </div>
    <div class="cards"></div>
    <div class="gauge"><div class="gfill"></div><div class="gticks"></div><span class="gnum"></span></div>`;
  const cards = el.querySelector('.cards');
  const cardEls = p.deck.map((id, i) => {
    const c = CHAR[id];
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = `<span class="cost">${c.cost}</span><span class="cname">${c.name}</span>`;
    b.prepend(charImg(id));
    const ch = document.createElement('span'); ch.className = 'charge'; b.appendChild(ch);
    b.addEventListener('pointerdown', e => { e.preventDefault(); p.sel = p.sel === i ? null : i; refreshSel(side); });
    cards.appendChild(b);
    return b;
  });
  el.querySelectorAll('.lane').forEach(b => {
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      const i = +b.dataset.i;
      const lane = side === 0 ? i : 2 - i;      // P2は向かい側なので左右反転
      tryDeploy(side, lane);
    });
  });
  panels[side] = {
    el, cards: cardEls, fill: el.querySelector('.gfill'), gauge: el.querySelector('.gauge'),
    num: el.querySelector('.gnum'), timer: el.querySelector('.p-timer'), hp: el.querySelector('.p-hp'),
  };
  refreshSel(side);
}
function refreshSel(side) {
  const p = game.players[side], pn = panels[side];
  if (!pn || pn.com) return;
  pn.cards.forEach((b, i) => b.classList.toggle('sel', p.sel === i));
  pn.el.classList.toggle('armed', p.sel != null);
}
function tryDeploy(side, lane) {
  const p = game.players[side];
  if (p.sel == null) { banner('先にキャラを選んでね'); return; }
  const id = p.deck[p.sel];
  if (deploy(side, id, lane)) { p.sel = null; refreshSel(side); }
  else {
    const b = panels[side].cards[p.sel];
    b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  }
}
function updateHUD() {
  if (!game) return;
  const t = Math.ceil(game.time), ts = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  for (let s = 0; s < 2; s++) {
    const pn = panels[s], p = game.players[s];
    if (!pn) continue;
    pn.timer.textContent = ts;
    pn.timer.classList.toggle('ot', game.ot);
    if (pn.com) continue;
    pn.fill.style.width = (p.gauge / GAUGE_MAX * 100) + '%';
    pn.gauge.classList.toggle('ot', game.ot);
    pn.num.textContent = Math.floor(p.gauge) + (game.ot ? '  残業中×2' : '');
    pn.hp.textContent = '🏯 ' + Math.ceil(p.baseHp);
    pn.cards.forEach((b, i) => {
      const c = CHAR[p.deck[i]];
      const r = Math.min(1, p.gauge / c.cost);
      b.style.setProperty('--p', r);
      b.classList.toggle('no', r < 1);
    });
  }
}

/* キャンバスを直接タップしても出陣できる */
cv.addEventListener('pointerdown', e => {
  if (!game || game.over) return;
  const r = cv.getBoundingClientRect();
  const lx = (e.clientX - r.left) / r.width * W, ly = (e.clientY - r.top) / r.height * H;
  const side = ly > MID ? 0 : 1;
  if (game.players[side].com) return;
  if (game.players[side].sel == null) return;
  let lane = 0, bd = Infinity;
  LANES.forEach((x, i) => { if (Math.abs(x - lx) < bd) { bd = Math.abs(x - lx); lane = i; } });
  tryDeploy(side, lane);
});

function startBattle() {
  newGame();
  $('result').classList.add('hidden');
  $('panel1').style.display = '';
  buildPanel(0); buildPanel(1);
  show('battle');
}

function endGame() {
  const g = game;
  g.over = true;
  const [a, b] = g.players;
  let w;
  if (a.baseHp <= 0 && b.baseHp <= 0) w = -1;
  else if (b.baseHp <= 0) w = 0;
  else if (a.baseHp <= 0) w = 1;
  else w = a.baseHp > b.baseHp ? 0 : b.baseHp > a.baseHp ? 1 : -1;
  const ko = a.baseHp <= 0 || b.baseHp <= 0;
  let big, flip = '';
  if (setup.mode === 'com') big = w === 0 ? '勝利！天下統一' : w === 1 ? '敗北…左遷です' : '引き分け（定時退社）';
  else {
    big = w === 0 ? 'P1の勝利！' : w === 1 ? 'P1の敗北…' : '引き分け';
    flip = w === 1 ? 'P2の勝利！' : w === 0 ? 'P2の敗北…' : '引き分け';
  }
  $('res-big').textContent = big;
  $('res-flip').textContent = flip;
  $('res-flip').classList.toggle('hidden', !flip);
  $('res-sub').innerHTML = (ko ? '拠点破壊による決着！' : '時間切れ：拠点の残りHPで判定') +
    `<br>${setup.mode === 'com' ? 'あなた' : 'P1'} ${Math.ceil(a.baseHp)} ／ ${setup.mode === 'com' ? 'COM' : 'P2'} ${Math.ceil(b.baseHp)}`;
  setTimeout(() => $('result').classList.remove('hidden'), 900);
  banner(ko ? '落城！' : 'そこまで！');
}

/* モーダル */
function modal(html) { $('modal-body').innerHTML = html; $('modal').classList.remove('hidden'); $('modal-body').scrollTop = 0; }
$('modal-close').onclick = () => $('modal').classList.add('hidden');

function howto() {
  modal(`<h3>遊び方</h3>
  <p><b>目的：</b>60秒以内に相手の「本丸オフィス城」を破壊！ 時間切れなら城のHPが多い方の勝ち。</p>
  <p><b>出陣：</b>下のゲージ（予算）が時間でたまります。<b>キャラのカード → ルート（左・中・右）</b>の順にタップ。カードを選んだあと戦場の自陣側をタップしてもOK。</p>
  <p><b>進軍：</b>キャラは選んだルートを自動で進み、敵に出会うと戦闘、誰もいなければ城を攻撃します。城は近づいた敵を火縄銃で迎え撃ちます。</p>
  <p><b>残業タイム：</b>残り20秒でゲージが2倍速！</p>
  <h4>三すくみ（有利なら1.5倍ダメージ）</h4>
  <p>🟦 サラリーマン ▶ 🟥 YouTuber：組織力とコンプラでノリを押しつぶす<br>
  🟥 YouTuber ▶ 🟪 コンサル：予測不能なバズでロジックを崩壊<br>
  🟪 コンサル ▶ 🟦 サラリーマン：カタカナ語で士気を奪う<br>
  🟩 無属性（弁護士・エンジニア）は相性なし</p>
  <h4>ふたりで合戦</h4>
  <p>1台のスマホを机に置き、P1は下側・P2は上側から操作します（同時にタップOK）。</p>`);
}

function geminiGuide() {
  const all = CHARS.concat(GEMINI_EXTRA);
  let h = `<h3>キャラデザ指示（Gemini用）</h3>
  <p>下の指示文をコピーしてGeminiに貼り付け、画像を作ってもらいます。できた画像は<b>背景を透明にしたPNG</b>にして、<code>img</code>フォルダに指定のファイル名で保存すると、ゲーム内の仮キャラが自動で差し替わります。</p>
  <p style="font-size:12px;color:#666">コツ：1体目ができたら、2体目以降は「さっきと同じ画風で」と付け足すと統一感が出ます。</p>
  <h4>共通スタイル <button class="cp" data-k="common">コピー</button></h4><div class="pr">${GEMINI_COMMON}</div>`;
  for (const c of all) {
    h += `<h4>${c.name} → <code>img/${c.id}.png</code> <button class="cp" data-k="${c.id}">コピー</button></h4><div class="pr">${geminiPrompt(c).split('\n\n').pop()}</div>`;
  }
  modal(h);
  $('modal-body').querySelectorAll('.cp').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.k;
      const text = k === 'common' ? GEMINI_COMMON : geminiPrompt(all.find(c => c.id === k));
      copyText(text).then(ok => { b.textContent = ok ? 'コピーしました' : 'コピー失敗'; setTimeout(() => b.textContent = 'コピー', 1500); });
    };
  });
}
function copyText(t) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(() => true, () => fallback());
  return Promise.resolve(fallback());
  function fallback() {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove(); return ok;
  }
}

/* ---------- ボタン ---------- */
$('diff').querySelectorAll('button').forEach(b => b.onclick = () => {
  setup.diff = b.dataset.d;
  $('diff').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
});
$('btn-com').onclick = () => { setup.mode = 'com'; openSelect(0); };
$('btn-pvp').onclick = () => { setup.mode = 'pvp'; openSelect(0); };
$('btn-howto').onclick = howto;
$('btn-gemini').onclick = geminiGuide;
$('sel-back').onclick = () => { $('handoff').classList.add('hidden'); show('title'); };
$('sel-rand').onclick = () => { picks = randomDeck(); renderGrid(); };
$('sel-ok').onclick = () => {
  if (picks.length !== 3) return;
  const side = setup.picking;
  setup.decks[side] = picks.slice();
  saveDeck(side, picks);
  if (setup.mode === 'com') { setup.decks[1] = randomDeck(); startBattle(); }
  else if (side === 0) { $('handoff').classList.remove('hidden'); }
  else startBattle();
};
$('handoff-ok').onclick = () => { $('handoff').classList.add('hidden'); openSelect(1); };
$('res-again').onclick = () => { if (setup.mode === 'com') setup.decks[1] = randomDeck(); startBattle(); };
$('res-select').onclick = () => openSelect(0);
$('res-title').onclick = () => { game = null; show('title'); drawTriArt(); };

window.addEventListener('resize', () => { if ($('battle').classList.contains('show')) fitCanvas(); });
document.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- メインループ ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game && $('battle').classList.contains('show')) { update(dt); render(); updateHUD(); }
  requestAnimationFrame(frame);
}

makeIcons();
loadImages();
drawTriArt();
setTimeout(drawTriArt, 800);   // 画像が読み込まれたら描き直し
if (document.fonts) document.fonts.ready.then(drawTriArt);
requestAnimationFrame(frame);
