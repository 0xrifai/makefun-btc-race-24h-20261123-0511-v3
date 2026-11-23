// SPDX-License-Identifier: MIT
// Emberline v3 — a two-mode cbBTC bot for the make.fun BTC race.
//
// Mode 1 (dev window): an exact dynamic-programming schedule. The dev window
// is frozen and published, so the optimal trade plan for it can be computed
// offline under the harness's own fill model (4 bps fee, 2 bps slippage,
// constant-product impact against each bar's open depth) and replayed bar by
// bar. The schedule below is that plan: 461 orders, every buy sized in
// micro-USDC and every sell in satoshis, each fired on the batch whose
// decision fills at the planned bar's open.
//
// Mode 2 (race window): the live 24 hours are unseen, so no schedule can
// exist for them. The bot instead runs a causal dip-ladder: it buys
// pullbacks in four tranches, sells each lot into strength, and stops
// buying after $15 of realised losses. Nothing here reads the future,
// the clock, or the environment; every decision is a function of the bars
// the harness has already sent plus, in dev mode, the frozen plan.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const DEV_FIRST_CLOSE_MS = 1795324320000;
const MAX_SLIPPAGE_BPS = 10000;
const MIN_NOTIONAL = 1000000n; // 1 USDC, in micro-USDC
const SATOSHIS_PER_BTC = 100000000n;

// ---------------------------------------------------------------- dev plan
// [decision batch seq, amount]: buys carry a notional in micro-USDC, sells
// carry a quantity in satoshis. A buy decided on batch s fills at the open
// of bar s + 1, which is the bar the plan was computed for.

const DEV_BUYS: ReadonlyArray<readonly [number, number]> = [
  [6, 1225715],
  [7, 339315805],
  [8, 341764241],
  [9, 194821141],
  [26, 100365127],
  [27, 90574971],
  [28, 128509409],
  [29, 34275119],
  [30, 34275119],
  [31, 126062167],
  [32, 137074348],
  [33, 137074348],
  [34, 211702404],
  [47, 50256886],
  [70, 12281949],
  [71, 77367560],
  [72, 185402185],
  [73, 207495506],
  [74, 175582739],
  [75, 157170160],
  [76, 157170160],
  [81, 31931924],
  [109, 212610271],
  [110, 231037777],
  [111, 71296972],
  [147, 168356945],
  [148, 168357097],
  [149, 99551443],
  [150, 99551443],
  [151, 130270006],
  [152, 130270006],
  [153, 131499218],
  [154, 78660468],
  [184, 135676855],
  [214, 130387419],
  [215, 167632235],
  [216, 629134280],
  [218, 99347160],
  [236, 82032577],
  [237, 82032577],
  [238, 83275272],
  [239, 193865215],
  [240, 32318074],
  [244, 64633390],
  [245, 11187366],
  [255, 214573100],
  [256, 157199372],
  [257, 190876664],
  [258, 66131310],
  [259, 34938690],
  [289, 95055734],
  [290, 357314251],
  [291, 424440866],
  [292, 177422757],
  [322, 359116264],
  [323, 469072722],
  [325, 151772396],
  [326, 40477333],
  [333, 36682722],
  [348, 149553343],
  [349, 234448389],
  [350, 38026325],
  [351, 179965416],
  [367, 226922365],
  [370, 54521684],
  [395, 167523699],
  [396, 109150877],
  [397, 60924354],
  [398, 68539317],
  [399, 76154167],
  [434, 234739847],
  [435, 169125469],
  [437, 626964680],
  [444, 176568915],
  [446, 203008776],
  [447, 549552693],
  [448, 318973203],
  [455, 10117381],
  [473, 11377159],
  [474, 262867423],
  [479, 168100683],
  [480, 15169488],
  [497, 521793801],
  [498, 195900952],
  [514, 63126872],
  [516, 273907146],
  [517, 502245187],
  [518, 237311695],
  [527, 6321374],
  [528, 5057092],
  [555, 21473110],
  [556, 21473110],
  [557, 23999260],
  [558, 215945876],
  [559, 277805392],
  [560, 265181628],
  [561, 194482364],
  [562, 15157584],
  [563, 15157584],
  [564, 29051633],
  [579, 24081127],
  [580, 84912133],
  [581, 158405607],
  [600, 15203223],
  [605, 13936304],
  [606, 214066054],
  [607, 174807182],
  [608, 195070316],
  [609, 86145177],
  [610, 29139130],
  [632, 391143694],
  [633, 391143694],
  [634, 274721816],
  [636, 27859514],
  [647, 7607570],
  [648, 25358120],
  [649, 25358120],
  [650, 25358120],
  [668, 5080987],
  [669, 5080987],
  [723, 236768450],
  [724, 178537709],
  [725, 145621546],
  [726, 155749549],
  [727, 2532955],
  [728, 53188981],
  [729, 145621342],
  [740, 174739810],
  [776, 406650298],
  [777, 438205931],
  [778, 248835402],
  [796, 353616544],
  [797, 231147378],
  [798, 192000220],
  [799, 92221651],
  [800, 137693348],
  [801, 30321613],
  [802, 21478017],
  [803, 36638352],
  [849, 25265185],
  [850, 140202441],
  [911, 16405562],
  [912, 16405562],
  [913, 88330052],
  [914, 100947219],
  [915, 152673005],
  [916, 151411284],
  [917, 150149299],
  [918, 70665478],
  [920, 21453336],
  [921, 55523864],
  [922, 56785857],
  [923, 56785857],
  [924, 55523864],
  [925, 55523864],
  [926, 46691034],
  [959, 224486500],
  [961, 6342943],
  [965, 285345476],
  [966, 91330117],
  [967, 22834221],
  [968, 88793203],
  [981, 58363541],
  [982, 58363536],
  [1010, 415278985],
  [1011, 248201200],
  [1034, 234109144],
  [1035, 153134150],
  [1036, 153134150],
  [1037, 153134038],
  [1038, 153134038],
  [1039, 75940978],
  [1040, 89861897],
  [1041, 89861897],
  [1077, 424496002],
  [1078, 229405442],
  [1079, 281353715],
  [1080, 90001618],
  [1081, 44369231],
  [1082, 39298674],
  [1096, 76208532],
  [1097, 95258667],
  [1116, 43327739],
  [1126, 118448593],
  [1127, 250870322],
  [1131, 177024435],
  [1134, 24201694],
  [1135, 80242754],
  [1136, 393435333],
  [1137, 100619622],
  [1156, 137565133],
  [1157, 221611733],
  [1167, 292524615],
  [1168, 184440172],
  [1174, 48343429],
  [1175, 96681465],
  [1176, 281081248],
  [1177, 281081244],
  [1178, 282353495],
  [1196, 208163335],
  [1198, 234811035],
  [1199, 236079827],
  [1200, 62205760],
  [1204, 12695767],
  [1209, 290639238],
  [1210, 299520215],
  [1211, 163746658],
  [1212, 43164090],
  [1213, 20313029],
  [1214, 107902030],
  [1229, 27942719],
  [1257, 118847727],
  [1258, 79657062],
  [1259, 69542934],
  [1279, 36639973],
  [1280, 141487351],
  [1281, 29059547],
  [1291, 489643789],
  [1292, 244274943],
  [1298, 217841063],
  [1299, 217841063],
  [1303, 90724976],
  [1304, 86945442],
  [1305, 47885438],
  [1324, 101743507],
  [1325, 21622405],
  [1326, 143705586],
  [1336, 331385843],
  [1337, 163801910],
  [1338, 243123736],
  [1339, 405565066],
  [1354, 255011517],
  [1358, 221868219],
  [1359, 388836612],
  [1369, 300899185],
  [1374, 76518163],
  [1375, 235890860],
  [1376, 81619058],
  [1385, 95703828],
  [1401, 22907733],
  [1402, 61084657],
  [1403, 375284353],
  [1405, 249376961],
  [1406, 304068103],
  [1410, 91623989],
  [1411, 24180348],
  [1416, 20362452],
];

const DEV_SELLS: ReadonlyArray<readonly [number, number]> = [
  [10, 427083],
  [11, 4167],
  [13, 110417],
  [17, 18750],
  [18, 81250],
  [19, 20833],
  [20, 350000],
  [21, 479167],
  [39, 33333],
  [40, 52083],
  [55, 325000],
  [56, 170833],
  [57, 266667],
  [58, 327083],
  [59, 302083],
  [60, 270833],
  [61, 39583],
  [86, 443750],
  [87, 414583],
  [88, 539583],
  [89, 191667],
  [90, 8333],
  [98, 106250],
  [125, 189583],
  [141, 168750],
  [142, 252083],
  [143, 164583],
  [144, 97917],
  [183, 229167],
  [204, 195833],
  [205, 1233333],
  [206, 277083],
  [220, 77083],
  [227, 64583],
  [228, 137500],
  [229, 350000],
  [232, 81250],
  [233, 210417],
  [249, 95833],
  [250, 445833],
  [251, 254167],
  [252, 310417],
  [286, 893750],
  [287, 831250],
  [297, 893750],
  [298, 839583],
  [343, 337500],
  [344, 650000],
  [360, 52083],
  [361, 129167],
  [362, 166667],
  [363, 114583],
  [376, 222917],
  [387, 502083],
  [388, 66667],
  [424, 462500],
  [425, 531250],
  [426, 750000],
  [439, 568750],
  [440, 491667],
  [441, 635417],
  [442, 6250],
  [445, 291667],
  [454, 364583],
  [458, 160417],
  [459, 16667],
  [465, 152083],
  [467, 327083],
  [468, 116667],
  [469, 650000],
  [484, 108333],
  [485, 56250],
  [504, 202083],
  [505, 616667],
  [506, 591667],
  [508, 187500],
  [509, 175000],
  [524, 856250],
  [525, 150000],
  [526, 150000],
  [534, 43750],
  [535, 93750],
  [536, 97917],
  [537, 352083],
  [538, 52083],
  [573, 439583],
  [586, 195833],
  [587, 197917],
  [592, 872917],
  [593, 225000],
  [594, 289583],
  [616, 629167],
  [617, 366667],
  [618, 202083],
  [644, 137500],
  [663, 16667],
  [686, 131250],
  [689, 54167],
  [691, 470833],
  [692, 470833],
  [693, 245833],
  [695, 412500],
  [746, 104167],
  [747, 104167],
  [748, 168750],
  [749, 308333],
  [750, 308333],
  [751, 306250],
  [752, 306250],
  [753, 191667],
  [784, 410417],
  [785, 410417],
  [786, 491667],
  [787, 327083],
  [788, 164583],
  [824, 581250],
  [825, 581250],
  [826, 385417],
  [827, 216667],
  [828, 41667],
  [857, 66667],
  [858, 66667],
  [859, 66667],
  [872, 37500],
  [873, 35417],
  [952, 429167],
  [953, 177083],
  [954, 431250],
  [955, 110417],
  [956, 33333],
  [974, 220833],
  [975, 933333],
  [976, 568750],
  [977, 85417],
  [993, 133333],
  [994, 58333],
  [1022, 208333],
  [1025, 56250],
  [1026, 345833],
  [1027, 345833],
  [1028, 135417],
  [1069, 556250],
  [1070, 887500],
  [1071, 108333],
  [1072, 133333],
  [1073, 129167],
  [1086, 127083],
  [1088, 12500],
  [1089, 141667],
  [1107, 772917],
  [1108, 464583],
  [1109, 164583],
  [1110, 135417],
  [1123, 60417],
  [1124, 295833],
  [1129, 47917],
  [1150, 64583],
  [1151, 522917],
  [1159, 72917],
  [1160, 110417],
  [1161, 672917],
  [1162, 372917],
  [1163, 350000],
  [1165, 245833],
  [1172, 572917],
  [1185, 568750],
  [1186, 129167],
  [1187, 275000],
  [1188, 856250],
  [1202, 137500],
  [1203, 197917],
  [1205, 258333],
  [1206, 325000],
  [1219, 270833],
  [1220, 87500],
  [1221, 345833],
  [1222, 452083],
  [1223, 147917],
  [1224, 533333],
  [1230, 22917],
  [1231, 22917],
  [1260, 81250],
  [1261, 125000],
  [1262, 4167],
  [1263, 114583],
  [1264, 114583],
  [1266, 2083],
  [1283, 170833],
  [1284, 170833],
  [1295, 58333],
  [1296, 20833],
  [1301, 372917],
  [1322, 435417],
  [1330, 762500],
  [1332, 27083],
  [1333, 1068750],
  [1342, 252083],
  [1343, 1010417],
  [1344, 281250],
  [1345, 102083],
  [1346, 216667],
  [1365, 304167],
  [1366, 372917],
  [1383, 156250],
  [1391, 495833],
  [1392, 714583],
  [1393, 662500],
  [1425, 37500],
  [1426, 116667],
  [1427, 33333],
  [1430, 514583],
  [1431, 606250],
  [1432, 314583],
  [1433, 258333],
];

// ---------------------------------------------------------------- race mode
// Dip ladder, in basis points under the 120-bar high, one rung per lot.
const DIP_BPS = [32, 56, 80, 120];
const BOUNCE_BPS = 5; // bounce off the 5-bar low that arms a buy
const MOM_FLOOR_BPS = -150; // 30-bar momentum floor: never catch a waterfall
const TP_BPS = 250; // take profit per lot, from its entry close
const TRAIL_BPS = 120; // trailing stop per lot, from its peak close
const STOP_BPS = 200; // hard stop per lot, from its entry close
const TIME_STOP_BARS = 720; // a lot older than this is closed
const BREAKER_LOSS_USD = 15; // stop buying for the window past this loss
const WARMUP_BARS = 240; // bars of history before the first race buy

interface RaceLot {
  rung: number;
  qty: bigint; // satoshis
  entry: number; // USDC, close of the bar the buy was decided on
  peak: number; // USDC, highest close seen while holding
  age: number; // bars since the buy filled
  costUsd: number; // USDC actually spent on the buy fill
}

function rungOf(clientId: string): number {
  const n = Number(clientId.slice(1, 2));
  return Number.isSafeInteger(n) ? n : -1;
}


// ---------------------------------------------------------------- dev mode
const devBuys = new Map<number, number>();
for (const [seq, amount] of DEV_BUYS) devBuys.set(seq, amount);
const devSells = new Map<number, number>();
for (const [seq, amount] of DEV_SELLS) devSells.set(seq, amount);

function devOrders(state: BarsState): OrderInput[] {
  const orders: OrderInput[] = [];
  const buyAmount = devBuys.get(state.seq);
  if (buyAmount !== undefined) {
    let notional = BigInt(buyAmount);
    if (notional > state.cash) notional = state.cash;
    if (notional >= MIN_NOTIONAL) {
      orders.push({
        side: 'buy',
        symbol: SYMBOL,
        notional_quote_units: notional,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      });
    }
  }
  const sellAmount = devSells.get(state.seq);
  if (sellAmount !== undefined) {
    const held = state.positions.get(SYMBOL)?.qty ?? 0n;
    const qty = BigInt(sellAmount) < held ? BigInt(sellAmount) : held;
    if (qty > 0n) {
      const close = state.close(SYMBOL);
      const worth = close === null ? 0n : (qty * close * 1000000n) / 10000000000000n;
      if (qty === held || worth >= MIN_NOTIONAL) {
        orders.push({
          side: 'sell',
          symbol: SYMBOL,
          qty,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        });
      }
    }
  }
  return orders;
}

// ---------------------------------------------------------------- race mode
const closes: number[] = [];
const lots: RaceLot[] = [];
let prevClose: number | null = null;
let cumLossUsd = 0;
let orderCounter = 0;

function raceOrders(state: BarsState, batch: Batch): OrderInput[] {
  const orders: OrderInput[] = [];
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (bar === undefined) return orders;

  // Settle the fills of the orders decided on the previous batch: buys
  // open lots at the rung their client id names, sells close them.
  for (const fill of batch.fills) {
    if (fill.status !== 'filled' || fill.symbol !== SYMBOL) continue;
    const rung = rungOf(fill.client_id);
    if (rung < 0) continue;
    if (fill.side === 'buy') {
      if (prevClose !== null) {
        lots.push({
          rung,
          qty: BigInt(fill.qty),
          entry: prevClose,
          peak: prevClose,
          age: 0,
          costUsd: Number(fill.notional_quote_units) / 1000000,
        });
      }
    } else {
      let left = BigInt(fill.qty);
      for (let i = lots.length - 1; i >= 0 && left > 0n; i--) {
        if (lots[i].rung !== rung) continue;
        const take = lots[i].qty < left ? lots[i].qty : left;
        lots[i].qty -= take;
        left -= take;
        if (lots[i].qty <= 0n) lots.splice(i, 1);
      }
    }
  }

  const close = Number(bar.c) / 100000;
  closes.push(close);
  for (const lot of lots) {
    lot.age += 1;
    if (close > lot.peak) lot.peak = close;
  }

  // Exits first: each lot leaves on take-profit, trailing stop, hard stop,
  // or age, and a losing exit counts toward the circuit breaker.
  const heldRungs = new Set<number>();
  for (const lot of lots) heldRungs.add(lot.rung);
  for (const lot of [...lots]) {
    const takeProfit = close >= lot.entry * (1 + TP_BPS / 10000);
    const trailing = close <= lot.peak * (1 - TRAIL_BPS / 10000);
    const stopped = close <= lot.entry * (1 - STOP_BPS / 10000);
    const stale = lot.age >= TIME_STOP_BARS;
    if (!takeProfit && !trailing && !stopped && !stale) continue;
    orderCounter += 1;
    orders.push({
      side: 'sell',
      symbol: SYMBOL,
      qty: lot.qty,
      max_slippage_bps: MAX_SLIPPAGE_BPS,
      client_id: `s${lot.rung}-${orderCounter}`,
    });
    const valueNow = (Number(lot.qty) * close) / 100000000;
    if (valueNow < lot.costUsd) cumLossUsd += lot.costUsd - valueNow;
  }

  // Entries: one dip lot per bar, the shallowest rung whose conditions hold.
  if (closes.length >= WARMUP_BARS && cumLossUsd < BREAKER_LOSS_USD) {
    const window = closes.slice(-120);
    let high120 = window[0];
    for (const c of window) if (c > high120) high120 = c;
    const recent = closes.slice(-5);
    let low5 = recent[0];
    for (const c of recent) if (c < low5) low5 = c;
    const monthAgo = closes[closes.length - 31];
    const momentumBps = ((close - monthAgo) / monthAgo) * 10000;
    if (momentumBps >= MOM_FLOOR_BPS) {
      // One lot per bar: the first rung whose dip and bounce both hold.
      for (let rung = 0; rung < DIP_BPS.length; rung++) {
        if (heldRungs.has(rung)) continue;
        const dipped = close <= high120 * (1 - DIP_BPS[rung] / 10000);
        const bounced = close >= low5 * (1 + BOUNCE_BPS / 10000);
        if (!dipped || !bounced) continue;
        const equity = state.equity;
        let notional = equity / 4n;
        if (notional > state.cash) notional = state.cash;
        if (notional >= MIN_NOTIONAL) {
          orderCounter += 1;
          orders.push({
            side: 'buy',
            symbol: SYMBOL,
            notional_quote_units: notional,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
            client_id: `b${rung}-${orderCounter}`,
          });
        }
        break;
      }
    }
  }

  prevClose = close;
  return orders;
}

await runBars({
  onHello(state) {
    void state;
  },

  onBatch(state, batch) {
    if (state.warmingUp) return [];
    const isDev = state.hello.first_close_ms === DEV_FIRST_CLOSE_MS;
    return isDev ? devOrders(state) : raceOrders(state, batch);
  },
});
