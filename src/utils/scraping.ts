import { PlatformId, Transaction } from '../types';

export const AMOUNT_REGEX = /₹\s?\d+(?:,\d{3})*(?:\.\d{1,2})?/g;
export const DATE_REGEX = /\b\d{1,2}\s[A-Za-z]+\s\d{4}\b/;
/** Swiggy order list: "Oct 05, 2025, 11:00 PM" */
export const SWIGGY_ORDER_DATE_REGEX = /\b([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4},\s*\d{1,2}:\d{2}\s*(?:AM|PM))\b/i;

/**
 * Swiggy order-history card (current web build). Hashes change when they redeploy CSS modules.
 * Prefer text-based parsers when these stop matching.
 */
export const SWIGGY_ORDER_CARD_CSS = {
  root: '_3olXG',
  restaurant: '_1LCnM',
  area: '_2PMmm',
  orderMeta: '_3TE0B',
  viewDetails: '_1EHb_',
  delivered: '_2Yjbx',
  itemLine: '_3dGiA',
  totalRow: '_2xH-a',
  totalAmount: '_1H0ME',
} as const;

/** Swiggy past-orders page (entry URL, auto-redirect target, manual retry). */
export const SWIGGY_ORDER_HISTORY_URL = 'https://www.swiggy.com/my-account/orders';

/** Initial URL for the in-app WebView — desktop order/account surfaces where possible. */
export const EMBEDDED_BROWSER_ENTRY_URL: Record<PlatformId, string> = {
  swiggy: SWIGGY_ORDER_HISTORY_URL,
  zomato: 'https://www.zomato.com/users',
  makemytrip: 'https://www.makemytrip.com/mytrips',
};

const PLATFORM_URL_PATTERNS: Record<PlatformId, string[]> = {
  swiggy: [
    'order',
    'orders',
    'history',
    'past-orders',
    'delivered',
    'my-account',
    'account',
    'instamart',
    'dineout',
    'my-orders',
  ],
  zomato: ['order', 'orders', 'history', 'past-orders', 'delivered', 'profile', 'account', 'users', 'your-orders'],
  makemytrip: [
    'booking',
    'bookings',
    'bookingsummary',
    'trip',
    'trips',
    'mytrips',
    'my-trip',
    'itinerary',
    'account',
    'profile',
    'upcoming',
    'cancelled',
    'completed',
    'unsuccessfull',
    'unsuccessful',
  ],
};

const PLATFORM_HINTS: Record<PlatformId, string[]> = {
  swiggy: [
    'restaurant',
    'delivered',
    'order id',
    'ordered on',
    'bill details',
    'instamart',
    'bill paid',
    'dineout',
    'rate order',
    'reorder',
    'payment unsuccessful',
  ],
  zomato: ['restaurant', 'order id', 'delivered', 'invoice', 'ordered on'],
  makemytrip: [
    'flight',
    'train',
    'hotel',
    'booking id',
    'traveller',
    'itinerary',
    'booking summary',
    'upcoming',
    'cancelled',
    'completed',
    'unsuccessfull',
    'unsuccessful',
  ],
};

const MERCHANT_STOP_WORDS = [
  'order',
  'orders',
  'order details',
  'order id',
  'bill details',
  'delivered',
  'cancelled',
  'completed',
  'upcoming',
  'unsuccessfull',
  'unsuccessful',
  'help',
  'track',
  'reorder',
  'invoice',
  'total',
  'bill paid',
  'payment unsuccessful',
  'view help',
  'you availed',
  "you haven't rated",
  'payments',
  'refunds',
  'wallet',
  'swiggy one',
  'super',
  'membership',
  'manage',
  'addresses',
  'favourites',
  'settings',
];

/** Labels from Swiggy account / nav, not restaurant names */
function looksLikeSwiggyUiMerchantJunk(line: string): boolean {
  const t = line.trim();
  if (!t) {
    return true;
  }
  if (/^(edit|menu|back|close|done|ok|pay|filter|sort|apply|clear|search)$/i.test(t)) {
    return true;
  }
  if (/^([A-Z]|\s){2,8}$/.test(t) && t.length <= 8 && !/[a-z]/.test(t)) {
    return true;
  }
  const low = t.toLowerCase();
  if (/payments?\s*(and|&)?\s*refunds?/.test(low)) {
    return true;
  }
  if (/\b(wallet|favourites|favorites|address(es)?|account|help|support|terms|privacy)\b/i.test(low)) {
    return true;
  }
  return false;
}

export function getPlatformTip(platform: PlatformId): string {
  if (platform === 'swiggy') {
    return 'Open Past orders if you can, then Extract. Stuck? Tap “Fresh load orders” or “Paste orders” below.';
  }
  if (platform === 'zomato') {
    return 'Sign in if asked. Open Your orders from profile, then extract.';
  }
  if (platform === 'makemytrip') {
    return 'Open My Trips or a booking summary page before extracting.';
  }
  return 'Open Orders or Order History page before extracting.';
}

export function isRelevantExtractionUrl(platform: PlatformId, url: string): boolean {
  const normalized = url.toLowerCase();
  const onExpectedDomain =
    (platform === 'swiggy' && normalized.includes('swiggy.com')) ||
    (platform === 'zomato' && normalized.includes('zomato.com')) ||
    (platform === 'makemytrip' && normalized.includes('makemytrip.com'));

  if (!onExpectedDomain) {
    return false;
  }

  return PLATFORM_URL_PATTERNS[platform].some((pattern) => normalized.includes(pattern));
}

export function extractCurrency(line: string): number[] {
  const matches = line.match(AMOUNT_REGEX) ?? [];
  return matches
    .map((amountText) => Number(amountText.replace(/[₹,\s]/g, '')))
    .filter((amount) => Number.isFinite(amount));
}

export function extractDates(line: string): string[] {
  const swiggy = line.match(SWIGGY_ORDER_DATE_REGEX);
  if (swiggy) {
    return [swiggy[1]];
  }
  const match = line.match(DATE_REGEX);
  return match ? [match[0]] : [];
}

function looksLikeAllCapsProfileName(line: string): boolean {
  const t = line.trim();
  if (t.length < 8 || t.includes('₹')) {
    return false;
  }
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return false;
  }
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 10) {
    return false;
  }
  return letters === letters.toUpperCase();
}

export function extractMerchants(line: string, opts?: { swiggyStrict?: boolean }): string[] {
  const clean = line.replace(/[^\w\s.&-]/g, '').trim();
  if (!clean || clean.length < 2) {
    return [];
  }
  if (looksLikeSwiggyUiMerchantJunk(line)) {
    return [];
  }
  if (looksLikeAllCapsProfileName(clean)) {
    return [];
  }
  const lower = clean.toLowerCase();
  if (/\d/.test(clean) || MERCHANT_STOP_WORDS.some((word) => lower.includes(word)) || clean.length > 48) {
    return [];
  }
  if (opts?.swiggyStrict && !/[a-z]/.test(line)) {
    return [];
  }
  return [clean];
}

function getCategory(platform: PlatformId): Transaction['category'] {
  if (platform === 'makemytrip') {
    return 'travel';
  }
  if (platform === 'swiggy' || platform === 'zomato') {
    return 'food';
  }
  return 'other';
}

export function buildTransactions(
  platform: PlatformId,
  lines: string[],
  opts?: { swiggyMerchantStrict?: boolean }
): Transaction[] {
  const category = getCategory(platform);
  const results: Transaction[] = [];
  const hints = PLATFORM_HINTS[platform].map((hint) => hint.toLowerCase());
  const swiggyStrict =
    platform === 'swiggy' ? opts?.swiggyMerchantStrict !== false : undefined;

  for (let i = 0; i < lines.length; i += 1) {
    const currentLine = lines[i] ?? '';
    const previousLine = lines[i - 1] ?? '';
    const nextLine = lines[i + 1] ?? '';
    const merchantCandidates = extractMerchants(
      currentLine,
      platform === 'swiggy' ? { swiggyStrict: Boolean(swiggyStrict) } : undefined
    );
    const currentLineAmounts = extractCurrency(currentLine);
    const nextLineAmounts = extractCurrency(nextLine);
    const amount = currentLineAmounts[0] ?? nextLineAmounts[0] ?? null;
    const hasHint = hints.some((hint) =>
      `${previousLine} ${currentLine} ${nextLine}`.toLowerCase().includes(hint)
    );

    if (!merchantCandidates[0] || !amount || !hasHint) {
      continue;
    }

    const dateWindow = `${lines[i - 2] ?? ''} ${previousLine} ${currentLine} ${nextLine}`;
    const date = extractDates(dateWindow)[0] ?? 'Unknown Date';

    results.push({
      id: `${platform}-${merchantCandidates[0]}-${amount}-${date}`.toLowerCase().replace(/\s+/g, '-'),
      platform,
      merchant: merchantCandidates[0],
      amount,
      date,
      category,
    });
  }

  return dedupeTransactions(
    results.filter((item) => Boolean(item.merchant) && Number.isFinite(item.amount) && item.amount >= 50)
  );
}

/** Parse pasted email / SMS / copied screen text when WebView extraction fails. */
export function buildTransactionsFromPastedText(platform: PlatformId, raw: string): Transaction[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const strict = buildTransactions(platform, lines);
  if (strict.length > 0) return strict;
  if (platform === 'swiggy') {
    return buildTransactions(platform, lines, { swiggyMerchantStrict: false });
  }
  return [];
}

export function dedupeTransactions(items: Transaction[]): Transaction[] {
  const map = new Map<string, Transaction>();
  items.forEach((item) => {
    const key = `${item.platform}|${item.merchant}|${item.amount}|${item.date}`.toLowerCase();
    if (!map.has(key)) {
      map.set(key, item);
    }
  });
  return Array.from(map.values());
}

/**
 * On Swiggy past-orders URL only: click "Show more" a few times (no redirects — avoids reload loops).
 */
export function getSwiggyOrdersExpandOnlyScript(): string {
  return `
(function () {
  try {
    var h = (location.hostname || '').toLowerCase();
    if (h.indexOf('swiggy.com') === -1) return;
    var p = (location.pathname || '').toLowerCase();
    if (p.indexOf('/my-account/orders') === -1) return;

    function findShowMoreBtn() {
      var candidates = document.querySelectorAll('button, a, [role="button"], span, div');
      var i, el, t;
      for (i = 0; i < candidates.length; i++) {
        el = candidates[i];
        if (!el) continue;
        t = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        if (t.indexOf('show more') !== -1 && (t.indexOf('order') !== -1 || t.indexOf('past') !== -1)) {
          return el;
        }
      }
      for (i = 0; i < candidates.length; i++) {
        el = candidates[i];
        if (!el) continue;
        t = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        if (t.indexOf('show more order') !== -1 || t === 'show more') return el;
      }
      return null;
    }

    function clickShowMoreRounds(left, delayMs) {
      if (left <= 0) return;
      var btn = findShowMoreBtn();
      if (btn) {
        try {
          btn.click();
        } catch (e1) {
          try {
            var ev = document.createEvent('MouseEvents');
            ev.initEvent('click', true, true);
            btn.dispatchEvent(ev);
          } catch (e2) {}
        }
      }
      setTimeout(function () {
        clickShowMoreRounds(left - 1, delayMs);
      }, delayMs);
    }

    setTimeout(function () {
      clickShowMoreRounds(3, 1300);
    }, 450);
  } catch (e) {}
})();
true;
`;
}

/** Expand "Show more orders", scroll to load virtualized rows, then RN injects scraper. */
export function getSwiggyPrefetchScrollScript(): string {
  return `
    (function () {
      function findShowMoreBtn() {
        var candidates = document.querySelectorAll('button, a, [role="button"], span, div');
        var i, el, t;
        for (i = 0; i < candidates.length; i++) {
          el = candidates[i];
          if (!el) continue;
          t = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          if (t.indexOf('show more') !== -1 && (t.indexOf('order') !== -1 || t.indexOf('past') !== -1)) {
            return el;
          }
        }
        for (i = 0; i < candidates.length; i++) {
          el = candidates[i];
          if (!el) continue;
          t = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          if (t.indexOf('show more order') !== -1 || t === 'show more') return el;
        }
        return null;
      }

      function runShowMoreThenScroll(roundsLeft) {
        if (roundsLeft <= 0) {
          startScrollPhase();
          return;
        }
        var btn = findShowMoreBtn();
        if (btn) {
          try {
            btn.click();
          } catch (e1) {
            try {
              var ev = document.createEvent('MouseEvents');
              ev.initEvent('click', true, true);
              btn.dispatchEvent(ev);
            } catch (e2) {}
          }
        }
        setTimeout(function () {
          runShowMoreThenScroll(roundsLeft - 1);
        }, 1300);
      }

      function startScrollPhase() {
        var lastHeight = 0;
        var stable = 0;
        var attempts = 0;
        function tick() {
          window.scrollTo(0, document.documentElement.scrollHeight);
          attempts++;
          var h = document.documentElement.scrollHeight;
          if (h === lastHeight) {
            stable++;
          } else {
            stable = 0;
            lastHeight = h;
          }
          if (stable >= 2 || attempts > 40) {
            window.scrollTo(0, 0);
            setTimeout(function () {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'swiggy_prefetch_scroll_done' }));
            }, 450);
            return;
          }
          setTimeout(tick, 280);
        }
        tick();
      }

      setTimeout(function () {
        runShowMoreThenScroll(3);
      }, 400);
    })();
    true;
  `;
}

export function getScrapingInjectionScript(platform: PlatformId): string {
  return `
    (function() {
      try {
        const platform = '${platform}';
        const platformHintsMap = {
          swiggy: [
            'restaurant',
            'delivered',
            'order id',
            'ordered on',
            'bill details',
            'completed',
            'cancelled',
            'instamart',
            'bill paid',
            'dineout',
            'rate order',
            'reorder',
            'payment unsuccessful'
          ],
          zomato: ['restaurant', 'order id', 'delivered', 'invoice', 'ordered on'],
          makemytrip: [
            'flight',
            'train',
            'hotel',
            'booking id',
            'traveller',
            'itinerary',
            'booking summary',
            'upcoming',
            'cancelled',
            'completed',
            'unsuccessfull',
            'unsuccessful'
          ]
        };
        const platformHints = platformHintsMap[platform] || [];
        const text = document.body ? document.body.innerText : '';
        const amountRegex = /₹\\s?\\d+(?:,\\d{3})*(?:\\.\\d{1,2})?/g;
        const dateRegex = /\\b\\d{1,2}\\s[A-Za-z]+\\s\\d{4}\\b/;
        const swiggyOrderDateRegex = /\\b([A-Za-z]{3,9}\\s+\\d{1,2},\\s*\\d{4},\\s*\\d{1,2}:\\d{2}\\s*(?:AM|PM))\\b/gi;
        const lines = text
          .split('\\n')
          .map((line) => line.trim())
          .filter(Boolean);
        const textTransactions = [];

        const isLikelyProfileAllCaps = (line) => {
          const t = (line || '').trim();
          if (t.length < 8 || t.includes('₹')) return false;
          const words = t.split(/\\s+/).filter(Boolean);
          if (words.length < 2) return false;
          const letters = t.replace(/[^A-Za-z]/g, '');
          if (letters.length < 10) return false;
          return letters === letters.toUpperCase();
        };

        const looksLikeSwiggyUiMerchantJunk = (line) => {
          const t = (line || '').trim();
          if (!t) return true;
          if (/^(edit|menu|back|close|done|ok|pay|filter|sort|apply|clear|search)$/i.test(t)) return true;
          if (t.length <= 8 && !/[a-z]/.test(t) && /^[A-Z\\s]+$/.test(t)) return true;
          const low = t.toLowerCase();
          if (/payments?\\s*(and|&)?\\s*refunds?/.test(low)) return true;
          if (/\\b(wallet|favourites|favorites|address(es)?|account|help|support|terms|privacy)\\b/i.test(low)) return true;
          return false;
        };

        const normalizeMerchant = (line) => {
          if (looksLikeSwiggyUiMerchantJunk(line)) return null;
          const clean = line.replace(/[^\\w\\s.&-]/g, '').trim();
          if (isLikelyProfileAllCaps(clean)) return null;
          const lower = clean.toLowerCase();
          const stopWords = [
            'order',
            'orders',
            'order details',
            'order id',
            'bill details',
            'delivered',
            'cancelled',
            'completed',
            'upcoming',
            'unsuccessfull',
            'unsuccessful',
            'help',
            'track',
            'reorder',
            'invoice',
            'total',
            'bill paid',
            'payment unsuccessful',
            'view help',
            'you availed',
            "you haven't rated",
            'payments',
            'refunds',
            'wallet',
            'swiggy one',
            'super',
            'membership',
            'manage',
            'addresses',
            'favourites'
          ];
          if (!clean || clean.length < 2 || clean.length > 48 || /\\d/.test(clean) || stopWords.some((word) => lower.includes(word))) {
            return null;
          }
          if (platform === 'swiggy' && !/^instamart$/i.test(line.trim()) && !/[a-z]/.test(line)) {
            return null;
          }
          return clean;
        };

        const extractFromText = () => {
          for (let i = 0; i < lines.length; i += 1) {
            const merchant = normalizeMerchant(lines[i] || '');
            const currentAmounts = (lines[i] || '').match(amountRegex) || [];
            const nextAmounts = (lines[i + 1] || '').match(amountRegex) || [];
            const amountText = currentAmounts[0] || nextAmounts[0];
            const contextWindow = [lines[i - 1], lines[i], lines[i + 1]].filter(Boolean).join(' ').toLowerCase();
            const hasHint = platformHints.some((hint) => contextWindow.includes(hint));
            if (!merchant || !amountText || !hasHint) continue;

            const amount = Number(String(amountText).replace(/[₹,\\s]/g, ''));
            if (!Number.isFinite(amount) || amount < 50) continue;

            const dateWindow = [lines[i - 2], lines[i - 1], lines[i], lines[i + 1]]
              .filter(Boolean)
              .join(' ');
            let date = 'Unknown Date';
            if (platform === 'swiggy') {
              const swMatch = dateWindow.match(swiggyOrderDateRegex);
              if (swMatch) date = swMatch[1];
              else {
                const legacy = dateWindow.match(dateRegex);
                date = legacy ? legacy[0] : date;
              }
            } else {
              const legacy = dateWindow.match(dateRegex);
              date = legacy ? legacy[0] : date;
            }
            const orderMatch = dateWindow.match(/order\\s*id\\s*[:#]?\\s*([A-Za-z0-9-]+)/i);

            textTransactions.push({
              id: [platform, merchant, amount, date].join('-').toLowerCase().replace(/\\s+/g, '-'),
              platform,
              merchant,
              amount,
              date,
              orderId: orderMatch ? orderMatch[1] : ''
            });
          }
        };

        const pickSwiggyMerchant = (linesInBlock) => {
          for (let j = 0; j < linesInBlock.length; j += 1) {
            const line = linesInBlock[j];
            if (!line || line.includes('₹')) continue;
            if (looksLikeSwiggyUiMerchantJunk(line)) continue;
            if (isLikelyProfileAllCaps(line)) continue;
            if (/^instamart$/i.test(line.trim())) return 'Instamart';
            const normalized = normalizeMerchant(line);
            if (normalized) return normalized;
          }
          return '';
        };

        const pickSwiggyAmountBeforeDate = (beforeDate) => {
          const lines = beforeDate.split('\\n').map((l) => l.trim()).filter(Boolean);
          const rupeeOnly = /^\\s*₹\\s?\\d+(?:,\\d{3})*(?:\\.\\d{1,2})?\\s*$/;
          for (let i = lines.length - 1; i >= 0; i -= 1) {
            const line = lines[i];
            if (rupeeOnly.test(line)) {
              const m = line.match(/₹\\s?\\d+(?:,\\d{3})*(?:\\.\\d{1,2})?/);
              if (m) return m[0];
            }
          }
          for (let i = lines.length - 1; i >= 0; i -= 1) {
            const line = lines[i];
            if (!line.includes('₹')) continue;
            const low = line.toLowerCase();
            if (/discount|saved|cashback|you availed|refund|wallet|payment|membership|super/.test(low)) continue;
            if (line.length > 55) continue;
            const m = line.match(/₹\\s?\\d+(?:,\\d{3})*(?:\\.\\d{1,2})?/);
            if (m) return m[0];
          }
          return null;
        };

        /**
         * Swiggy order card DOM you inspected: root _3olXG, name _1LCnM, ORDER line _3TE0B,
         * total row _2xH-a + amount span _1H0ME. Extend labels later (e.g. Amount Paid) in total row regex.
         */
        const extractSwiggyOrderHistoryByCssClasses = () => {
          const out = [];
          const roots = Array.from(document.querySelectorAll('div._3olXG'));
          const minimal = roots.filter((el) => !roots.some((other) => other !== el && el.contains(other)));
          for (let i = 0; i < minimal.length; i += 1) {
            const root = minimal[i];
            const nameEl = root.querySelector('._1LCnM');
            const orderEl = root.querySelector('._3TE0B');
            const totalRow = root.querySelector('._2xH-a');
            const amountSpan = root.querySelector('._2xH-a ._1H0ME') || root.querySelector('._1H0ME');
            if (!orderEl) continue;
            const orderText = (orderEl.textContent || '').trim();
            const fullOrder = orderText.match(/ORDER\\s*#\\s*(\\d+)\\s*\\|\\s*(.+)/i);
            let orderId = '';
            let dateStr = 'Unknown Date';
            if (fullOrder) {
              orderId = fullOrder[1];
              dateStr = fullOrder[2].trim();
            } else {
              const oid = orderText.match(/ORDER\\s*#\\s*(\\d+)/i);
              if (oid) orderId = oid[1];
            }
            const deliveredEl = root.querySelector('._2Yjbx');
            if (dateStr === 'Unknown Date' && deliveredEl) {
              const dm = (deliveredEl.textContent || '').match(/Delivered on\\s*([^\\n]+?)(?:\\s*$|✓|tick)/i);
              if (dm) dateStr = dm[1].trim();
            }
            let amount = NaN;
            if (amountSpan) {
              amount = Number(String(amountSpan.textContent || '').replace(/[,\\s]/g, ''));
            }
            if (!Number.isFinite(amount) || amount < 50) {
              const rowText = (totalRow && totalRow.textContent) || (root.innerText || '');
              const tm = rowText.match(/(?:Total Paid|Amount Paid):\\s*₹?\\s*([\\d,\\s]+)/i);
              if (tm) amount = Number(String(tm[1]).replace(/[,\\s]/g, ''));
            }
            if (!Number.isFinite(amount) || amount < 50) continue;
            let merchant = nameEl ? String(nameEl.textContent || '').trim() : '';
            if (merchant && (looksLikeSwiggyUiMerchantJunk(merchant) || isLikelyProfileAllCaps(merchant))) {
              merchant = '';
            }
            if (merchant && !/^instamart$/i.test(merchant) && !/[a-z]/.test(merchant)) {
              merchant = '';
            }
            if (!merchant) {
              const lines = (root.innerText || '').split('\\n').map((l) => l.trim()).filter(Boolean);
              merchant = pickSwiggyMerchant(lines);
            }
            if (!merchant) continue;
            out.push({
              id: ['swiggy', orderId || merchant, amount, dateStr].join('-').toLowerCase().replace(/\\s+/g, '-'),
              platform: 'swiggy',
              merchant: merchant,
              amount: amount,
              date: dateStr,
              orderId: orderId
            });
          }
          return out;
        };

        /**
         * Order history cards: text heuristics ORDER #... + Total Paid / Amount Paid (classes unknown).
         */
        const extractSwiggyOrderHistoryStructured = () => {
          const out = [];
          const nodes = Array.from(document.querySelectorAll('div'));
          const cards = [];
          for (let i = 0; i < nodes.length; i += 1) {
            const el = nodes[i];
            const t = (el.innerText || '').trim();
            if (t.length < 60 || t.length > 4500) continue;
            if (!/ORDER\\s*#\\s*\\d+/i.test(t)) continue;
            if (!/(?:Total Paid|Amount Paid):/i.test(t)) continue;
            cards.push(el);
          }
          const minimal = cards.filter((el) => !cards.some((other) => other !== el && el.contains(other)));
          for (let i = 0; i < minimal.length; i += 1) {
            const text = (minimal[i].innerText || '').trim();
            const lines = text.split('\\n').map((l) => l.trim()).filter(Boolean);
            const orderIdx = lines.findIndex((l) => /ORDER\\s*#/i.test(l));
            let orderId = '';
            let dateStr = 'Unknown Date';
            const fullOrder = text.match(/ORDER\\s*#\\s*(\\d+)\\s*\\|\\s*([^\\n]+)/i);
            if (fullOrder) {
              orderId = fullOrder[1];
              dateStr = fullOrder[2].trim();
            } else {
              const oid = text.match(/ORDER\\s*#\\s*(\\d+)/i);
              if (oid) orderId = oid[1];
              const del = text.match(/Delivered on\\s*([^\\n]+)/i);
              if (del && dateStr === 'Unknown Date') dateStr = del[1].trim().replace(/\\s*✓.*$/i, '').trim();
            }
            const tm =
              text.match(/(?:Total Paid|Amount Paid):\\s*₹?\\s*([\\d,\\s]+)/i) ||
              text.match(/(?:Total Paid|Amount Paid):[^\\d₹]*([\\d][\\d,\\s]*)/i);
            if (!tm) continue;
            const amount = Number(String(tm[1]).replace(/[,\\s]/g, ''));
            if (!Number.isFinite(amount) || amount < 50) continue;
            let merchant = '';
            const scanEnd = orderIdx >= 0 ? orderIdx : lines.length;
            for (let j = 0; j < scanEnd; j += 1) {
              const line = lines[j];
              if (!line || line.includes('₹')) continue;
              if (/VIEW DETAILS|^REORDER$|^HELP$|^img renderer$/i.test(line)) continue;
              if (looksLikeSwiggyUiMerchantJunk(line)) continue;
              if (isLikelyProfileAllCaps(line)) continue;
              if (/^instamart$/i.test(line.trim())) {
                merchant = 'Instamart';
                break;
              }
              const normalized = normalizeMerchant(line);
              if (normalized) {
                merchant = normalized;
                break;
              }
            }
            if (!merchant) {
              merchant = pickSwiggyMerchant(lines);
            }
            if (!merchant) continue;
            out.push({
              id: ['swiggy', orderId || merchant, amount, dateStr].join('-').toLowerCase().replace(/\\s+/g, '-'),
              platform: 'swiggy',
              merchant: merchant,
              amount: amount,
              date: dateStr,
              orderId: orderId
            });
          }
          return out;
        };

        const extractSwiggyByDateAnchors = (fullText) => {
          const out = [];
          const re = new RegExp(swiggyOrderDateRegex.source, 'gi');
          const hits = [];
          let m;
          while ((m = re.exec(fullText)) !== null) {
            hits.push({ date: m[1], index: m.index });
          }
          for (let h = 0; h < hits.length; h += 1) {
            const prevEnd = h === 0 ? Math.max(0, hits[h].index - 500) : hits[h - 1].index + hits[h - 1].date.length;
            const end = hits[h].index + hits[h].date.length;
            let segment = fullText.slice(prevEnd, end).trim();
            if (h === 0) {
              const arr = segment.split('\\n').map((line) => line.trim()).filter(Boolean);
              let cut = 0;
              for (let i = 0; i < arr.length; i += 1) {
                const L = arr[i].toLowerCase();
                if (L.includes('delivered') || L.includes('bill paid') || L.includes('instamart') || arr[i].includes('₹')) {
                  cut = Math.max(0, i - 4);
                  break;
                }
              }
              segment = arr.slice(cut).join('\\n');
            }
            const low = segment.toLowerCase();
            if (!/delivered|bill paid|payment unsuccessful|cancelled|instamart|rate order|reorder|bill total/.test(low)) {
              continue;
            }
            const dateStr = hits[h].date;
            const datePos = segment.lastIndexOf(dateStr);
            const beforeDate = datePos >= 0 ? segment.slice(0, datePos) : segment;
            const amountText = pickSwiggyAmountBeforeDate(beforeDate);
            if (!amountText) continue;
            const amount = Number(String(amountText).replace(/[₹,\\s]/g, ''));
            if (!Number.isFinite(amount) || amount < 50) continue;
            const segLines = segment.split('\\n').map((line) => line.trim()).filter(Boolean);
            const merchant = pickSwiggyMerchant(segLines);
            if (!merchant) continue;
            const orderMatch = segment.match(/order\\s*id\\s*[:#]?\\s*([A-Za-z0-9-]+)/i);
            out.push({
              id: ['swiggy', merchant, amount, hits[h].date, orderMatch ? orderMatch[1] : ''].join('-').toLowerCase().replace(/\\s+/g, '-'),
              platform: 'swiggy',
              merchant: merchant,
              amount: amount,
              date: hits[h].date,
              orderId: orderMatch ? orderMatch[1] : ''
            });
          }
          return out;
        };

        const extractSwiggyFromDom = () => {
          const result = [];
          const nodes = Array.from(document.querySelectorAll('article, section, li, div'));
          const statusRegex = /(delivered|cancelled|completed|on the way|arriving|bill paid|payment unsuccessful|instamart|bill total)/i;
          const todayRegex = /\\b(today|yesterday)\\b/i;

          for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            const block = (node && node.innerText ? node.innerText : '').trim();
            if (!block || block.length < 35 || block.length > 2200) continue;

            const lower = block.toLowerCase();
            const amountMatch = block.match(amountRegex);
            const orderIdMatch = block.match(/order\\s*id\\s*[:#]?\\s*([A-Za-z0-9-]+)/i);
            const dateMatchSwiggy = block.match(swiggyOrderDateRegex);
            const dateMatchLegacy = block.match(dateRegex);
            const dateMatch = dateMatchSwiggy || dateMatchLegacy;
            const hasStatus = statusRegex.test(lower);

            let score = 0;
            if (amountMatch && amountMatch.length > 0) score += 3;
            if (orderIdMatch) score += 3;
            if (hasStatus) score += 2;
            if (dateMatch || todayRegex.test(lower)) score += 3;
            if (lower.includes('restaurant') || lower.includes('dineout') || lower.includes('instamart')) score += 1;
            if (score < 5) continue;

            const linesInBlock = block.split('\\n').map((line) => line.trim()).filter(Boolean);
            const merchant = pickSwiggyMerchant(linesInBlock);

            let amountStr = '';
            if (dateMatchSwiggy) {
              const dpos = block.lastIndexOf(dateMatchSwiggy[1]);
              if (dpos >= 0) {
                const picked = pickSwiggyAmountBeforeDate(block.slice(0, dpos));
                if (picked) amountStr = picked;
              }
            }
            if (!amountStr && amountMatch && amountMatch[0]) {
              amountStr = amountMatch[0];
            }
            const amount = Number(String(amountStr).replace(/[₹,\\s]/g, ''));
            if (!merchant || !Number.isFinite(amount) || amount < 50) continue;

            const date = dateMatchSwiggy
              ? dateMatchSwiggy[1]
              : dateMatchLegacy
                ? dateMatchLegacy[0]
                : todayRegex.test(lower)
                  ? 'Today'
                  : 'Unknown Date';
            const orderId = orderIdMatch ? orderIdMatch[1] : '';

            result.push({
              id: [platform, merchant, amount, date, orderId].join('-').toLowerCase().replace(/\\s+/g, '-'),
              platform,
              merchant,
              amount,
              date,
              orderId: orderId
            });
          }

          return result;
        };

        extractFromText();
        const swiggyByCssClasses = platform === 'swiggy' ? extractSwiggyOrderHistoryByCssClasses() : [];
        const swiggyStructured = platform === 'swiggy' ? extractSwiggyOrderHistoryStructured() : [];
        const swiggyDateAnchored = platform === 'swiggy' ? extractSwiggyByDateAnchors(text) : [];
        const swiggyDomTransactions = platform === 'swiggy' ? extractSwiggyFromDom() : [];
        const transactions = platform === 'swiggy'
          ? swiggyByCssClasses
              .concat(swiggyStructured)
              .concat(swiggyDateAnchored)
              .concat(swiggyDomTransactions)
              .concat(textTransactions)
          : textTransactions;

        const deduped = [];
        const seen = new Set();
        transactions.forEach((item) => {
          const keyByOrder = item.orderId
            ? ['oid', item.platform, String(item.orderId)].join('|').toLowerCase()
            : '';
          if (keyByOrder && seen.has(keyByOrder)) {
            return;
          }
          const key = [item.platform, item.orderId || '', item.merchant, item.amount, item.date].join('|').toLowerCase();
          if (!seen.has(key)) {
            if (keyByOrder) seen.add(keyByOrder);
            seen.add(key);
            deduped.push(item);
          }
        });

        const message = JSON.stringify({ type: 'extraction_success', payload: deduped });
        const maxChunkSize = 60000;

        if (message.length <= maxChunkSize) {
          window.ReactNativeWebView.postMessage(message);
        } else {
          const transferId = String(Date.now()) + '-transactions';
          const totalChunks = Math.ceil(message.length / maxChunkSize);

          for (let index = 0; index < totalChunks; index += 1) {
            const start = index * maxChunkSize;
            const end = start + maxChunkSize;
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'extraction_chunk',
              payload: {
                transferId: transferId,
                index: index,
                totalChunks: totalChunks,
                chunk: message.slice(start, end)
              }
            }));
          }

          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'extraction_chunk_complete',
            payload: {
              transferId: transferId
            }
          }));
        }
      } catch (error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'extraction_error',
          payload: String(error)
        }));
      }
    })();
    true;
  `;
}
