import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';

import { useAppContext } from '../hooks/useAppContext';
import { PlatformId, RootStackParamList, Transaction } from '../types';
import {
  dedupeTransactions,
  EMBEDDED_BROWSER_ENTRY_URL,
  getPlatformTip,
  getScrapingInjectionScript,
  getSwiggyOrdersExpandOnlyScript,
  getSwiggyPrefetchScrollScript,
  isRelevantExtractionUrl,
} from '../utils/scraping';

type Props = NativeStackScreenProps<RootStackParamList, 'Browser'>;

const PLATFORM_CATEGORIES: Record<PlatformId, Transaction['category']> = {
  swiggy: 'food',
  zomato: 'food',
  makemytrip: 'travel',
};

const SWIGGY_ORDERS_PAGE_URL = 'https://www.swiggy.com/my-account/orders';
const DEFAULT_NEW_TAB_URL = 'https://www.google.com';
const MAX_TABS = 8;

function newTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Turn address bar input into a navigable URL (https default, Google search fallback). */
function normalizeUrlInput(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) {
    try {
      new URL(t);
      return t;
    } catch {
      return null;
    }
  }
  if (/\s/.test(t)) {
    return `https://www.google.com/search?q=${encodeURIComponent(t)}`;
  }
  const withScheme = `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.hostname.includes('.') || u.hostname === 'localhost') {
      return withScheme;
    }
  } catch {
    /* fall through */
  }
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`;
}

function isPartnerSiteUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h.includes('swiggy.com') || h.includes('zomato.com') || h.includes('makemytrip.com')
    );
  } catch {
    return false;
  }
}

const DESKTOP_BROWSER_USER_AGENT = Platform.select({
  ios: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  default:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
})!;

const DESKTOP_LAYOUT_VIEWPORT_WIDTH = 1280;
const DESKTOP_LAYOUT_INITIAL_SCALE = 0.32;

/** Desktop layout hack only on Swiggy / Zomato / MMT so arbitrary sites render normally. */
const DESKTOP_SITE_BOOTSTRAP_JS = `(function(){
  var h=(location.hostname||'').toLowerCase();
  if(h.indexOf('swiggy.com')<0&&h.indexOf('zomato.com')<0&&h.indexOf('makemytrip.com')<0)return;
  try {
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {
      get: function() { return 0; },
      configurable: true
    });
  } catch(e) {}

  var VIEWPORT_CONTENT = 'width=${DESKTOP_LAYOUT_VIEWPORT_WIDTH}, initial-scale=${DESKTOP_LAYOUT_INITIAL_SCALE}, minimum-scale=0.2, maximum-scale=3, user-scalable=yes';

  function applyViewport() {
    try {
      var head = document.head || document.documentElement;
      var v = document.querySelector('meta[name="viewport"]');
      if (!v) {
        v = document.createElement('meta');
        v.setAttribute('name', 'viewport');
        head.insertBefore(v, head.firstChild);
      }
      if (v.getAttribute('content') !== VIEWPORT_CONTENT) {
        v.setAttribute('content', VIEWPORT_CONTENT);
      }
    } catch(e) {}
  }

  applyViewport();

  try {
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        for (var j = 0; j < m.addedNodes.length; j++) {
          var node = m.addedNodes[j];
          if (node.nodeName === 'META' && node.getAttribute && node.getAttribute('name') === 'viewport') {
            applyViewport();
          }
        }
        if (m.type === 'attributes' && m.target && m.target.nodeName === 'META' && m.target.getAttribute && m.target.getAttribute('name') === 'viewport') {
          applyViewport();
        }
      }
    });
    var head = document.head || document.documentElement;
    observer.observe(head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
  } catch(e) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyViewport);
  }
})();true;`;

const REINJECT_VIEWPORT_JS = `(function(){
  var VIEWPORT_CONTENT = 'width=${DESKTOP_LAYOUT_VIEWPORT_WIDTH}, initial-scale=${DESKTOP_LAYOUT_INITIAL_SCALE}, minimum-scale=0.2, maximum-scale=3, user-scalable=yes';
  try {
    var head = document.head || document.documentElement;
    var v = document.querySelector('meta[name="viewport"]');
    if (!v) { v = document.createElement('meta'); v.setAttribute('name','viewport'); head.insertBefore(v, head.firstChild); }
    v.setAttribute('content', VIEWPORT_CONTENT);
  } catch(e) {}
})();true;`;

const SWIGGY_API_INTERCEPTOR_JS = `(function() {
  var h=(location.hostname||'').toLowerCase();
  if(h.indexOf('swiggy.com')===-1)return;

  var originalFetch = window.fetch;
  window.fetch = async function() {
    var args = arguments;
    var response = await originalFetch.apply(this, args);
    var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    if (
      url.indexOf('/api/order') !== -1 ||
      url.indexOf('/order-history') !== -1 ||
      url.indexOf('past-orders') !== -1 ||
      url.indexOf('/mapi/order') !== -1
    ) {
      try {
        var clone = response.clone();
        var data = await clone.json();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'api_intercepted',
          url: url,
          payload: data
        }));
      } catch (e) {}
    }
    return response;
  };

  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    xhr.addEventListener('load', function() {
      var u = xhr._url || '';
      if (
        u.indexOf('/api/order') !== -1 ||
        u.indexOf('/order-history') !== -1 ||
        u.indexOf('past-orders') !== -1 ||
        u.indexOf('/mapi/order') !== -1
      ) {
        try {
          var data = JSON.parse(xhr.responseText);
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'api_intercepted',
            url: u,
            payload: data
          }));
        } catch (e) {}
      }
    });
    return originalSend.apply(this, arguments);
  };
})();true;`;

const SWIGGY_COOKIE_EXTRACT_JS = `(function() {
  try {
    var h = (location.hostname || '').toLowerCase();
    if (h.indexOf('swiggy.com') !== -1 && document.cookie) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'swiggy_cookies',
        cookies: document.cookie
      }));
    }
  } catch(e) {}
})();true;`;

const BACKEND_URL = 'http://192.168.2.14:3001';

type BrowserTab = {
  id: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
};

function parseSwiggyApiResponse(data: unknown): Transaction[] {
  try {
    if (data === null || typeof data !== 'object') return [];
    const root = data as Record<string, unknown>;
    const inner = root.data;
    const innerObj = inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : null;

    const ordersRaw =
      (innerObj?.orders as unknown) ??
      (root.orders as unknown) ??
      (innerObj?.order_details as unknown) ??
      [];

    const orders = Array.isArray(ordersRaw) ? ordersRaw : [];

    return orders
      .filter((order): order is Record<string, unknown> => order !== null && typeof order === 'object')
      .map((order) => {
        const id = String(order.order_id ?? order.orderId ?? order.id ?? '');
        const total = order.order_total ?? order.orderTotal ?? order.total;
        const amount = typeof total === 'number' ? total : Number(total ?? 0);
        const nestedRest =
          order.restaurant && typeof order.restaurant === 'object' && order.restaurant !== null
            ? String((order.restaurant as { name?: unknown }).name ?? '')
            : '';
        const merchantCore = order.restaurant_name ?? order.restaurantName ?? nestedRest;
        const merchant =
          merchantCore === undefined || merchantCore === null || String(merchantCore).trim() === ''
            ? 'Unknown'
            : String(merchantCore);
        const dateRaw = order.order_time ?? order.orderTime ?? order.created_at ?? order.createdAt;
        const date =
          typeof dateRaw === 'number'
            ? new Date(dateRaw).toISOString()
            : String(dateRaw ?? 'Unknown Date');
        return {
          id: id ? `swiggy-${id}` : `swiggy-${merchant}-${date}-${amount}`,
          platform: 'swiggy' as const,
          merchant,
          amount,
          date,
          category: 'food' as const,
        };
      })
      .filter((t) => t.amount >= 50);
  } catch {
    return [];
  }
}

export function BrowserScreen({ route, navigation }: Props) {
  const { platform } = route.params;
  const initialEntry =
    platform === 'swiggy' ? SWIGGY_ORDERS_PAGE_URL : EMBEDDED_BROWSER_ENTRY_URL[platform];
  const firstIdRef = useRef(newTabId());

  const [tabs, setTabs] = useState<BrowserTab[]>(() => [
    {
      id: firstIdRef.current,
      url: initialEntry,
      title: 'Home',
      canGoBack: false,
      canGoForward: false,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState(firstIdRef.current);
  const [tabRemountNonce, setTabRemountNonce] = useState<Record<string, number>>({});
  const [addressInput, setAddressInput] = useState(initialEntry);
  const [addressFocused, setAddressFocused] = useState(false);
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});

  const webViewRefs = useRef<Record<string, WebView | null>>({});
  const extractionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extractionRetriesRef = useRef(0);
  const chunkBufferRef = useRef<Record<string, { totalChunks: number; chunks: string[] }>>({});
  const swiggyCookiesRef = useRef<string>('');

  const [isExtracting, setIsExtracting] = useState(false);
  const [isFetchingFromServer, setIsFetchingFromServer] = useState(false);
  const { setExtractedTransactions, extractedTransactions } = useAppContext();

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const currentUrl = activeTab?.url ?? '';

  const injectedJavaScriptBeforeContentLoaded = useMemo(
    () =>
      platform === 'swiggy'
        ? `${DESKTOP_SITE_BOOTSTRAP_JS}\n${SWIGGY_API_INTERCEPTOR_JS}`
        : DESKTOP_SITE_BOOTSTRAP_JS,
    [platform]
  );

  useEffect(() => {
    if (!addressFocused) {
      setAddressInput(activeTab?.url ?? '');
    }
  }, [activeTab?.url, activeTabId, addressFocused]);

  useEffect(() => {
    return () => {
      if (extractionTimeoutRef.current) clearTimeout(extractionTimeoutRef.current);
    };
  }, []);

  const bumpTabRemount = useCallback((tabId: string) => {
    setTabRemountNonce((n) => ({ ...n, [tabId]: (n[tabId] ?? 0) + 1 }));
  }, []);

  const updateTab = useCallback((tabId: string, patch: Partial<BrowserTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...patch } : t)));
  }, []);

  const handleAddTab = useCallback(() => {
    if (tabs.length >= MAX_TABS) {
      Alert.alert('Too many tabs', `Close a tab first (max ${MAX_TABS}).`);
      return;
    }
    const id = newTabId();
    setTabs((prev) => [
      ...prev,
      {
        id,
        url: DEFAULT_NEW_TAB_URL,
        title: 'New tab',
        canGoBack: false,
        canGoForward: false,
      },
    ]);
    setActiveTabId(id);
    setAddressFocused(false);
  }, [tabs.length]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      if (tabs.length <= 1) {
        Alert.alert('One tab left', 'Keep at least one tab open.');
        return;
      }
      const idx = tabs.findIndex((t) => t.id === tabId);
      const next = tabs.filter((t) => t.id !== tabId);
      setTabs(next);
      delete webViewRefs.current[tabId];
      if (activeTabId === tabId) {
        const fallback = next[Math.max(0, idx - 1)] ?? next[0];
        if (fallback) setActiveTabId(fallback.id);
      }
    },
    [tabs, activeTabId]
  );

  const handleNavigateFromAddressBar = useCallback(() => {
    const next = normalizeUrlInput(addressInput);
    if (!next) {
      Alert.alert('Invalid address', 'Enter a valid URL or search terms.');
      return;
    }
    setAddressFocused(false);
    updateTab(activeTabId, { url: next });
    bumpTabRemount(activeTabId);
  }, [addressInput, activeTabId, updateTab, bumpTabRemount]);

  const handleSwiggyFreshOrdersLoad = useCallback(() => {
    setTabLoading((l) => ({ ...l, [activeTabId]: true }));
    updateTab(activeTabId, { url: SWIGGY_ORDERS_PAGE_URL });
    bumpTabRemount(activeTabId);
  }, [activeTabId, updateTab, bumpTabRemount]);

  const handleFetchFromServer = async () => {
    const cookies = swiggyCookiesRef.current;
    if (!cookies) {
      Alert.alert(
        'Not logged in yet',
        'Log in to Swiggy in the browser first. Once logged in, tap this button again.'
      );
      return;
    }
    setIsFetchingFromServer(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/swiggy/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        Alert.alert('Server error', json.error ?? 'Unknown error from backend');
        return;
      }
      const txns: Transaction[] = (json.transactions ?? []).map(
        (t: Record<string, unknown>) => ({
          id: String(t.id ?? ''),
          platform: 'swiggy' as const,
          merchant: String(t.merchant ?? ''),
          amount: Number(t.amount ?? 0),
          date: String(t.date ?? ''),
          category: 'food' as const,
        })
      );
      if (txns.length === 0) {
        Alert.alert('No orders found', 'Swiggy returned 0 orders. Try re-logging in.');
        return;
      }
      setExtractedTransactions(dedupeTransactions(txns));
      navigation.navigate('ReviewTransactions', { platform });
    } catch (err) {
      Alert.alert('Network error', String(err));
    } finally {
      setIsFetchingFromServer(false);
    }
  };

  const handleShouldStartLoadWithRequestForTab = (tabId: string) => {
    return (req: { url: string; isTopFrame: boolean }) => {
      if (platform !== 'swiggy' || !req.isTopFrame) return true;

      try {
        const parsed = new URL(req.url);
        const host = parsed.hostname.toLowerCase();
        if (host === 'm.swiggy.com' || host === 'mobile.swiggy.com') {
          parsed.hostname = 'www.swiggy.com';
          const desktopUrl = parsed.toString();
          setTimeout(() => {
            webViewRefs.current[tabId]?.injectJavaScript(
              `window.location.href = ${JSON.stringify(desktopUrl)};true;`
            );
          }, 100);
          return false;
        }
      } catch (_) {
        /* ignore */
      }

      return true;
    };
  };

  const startExtractionTimeout = (durationMs = 9000) => {
    if (extractionTimeoutRef.current) clearTimeout(extractionTimeoutRef.current);
    extractionTimeoutRef.current = setTimeout(() => {
      const wv = webViewRefs.current[activeTabId];
      if (extractionRetriesRef.current < 1 && wv) {
        extractionRetriesRef.current += 1;
        startExtractionTimeout(durationMs);
        wv.injectJavaScript(getScrapingInjectionScript(platform));
        return;
      }
      setIsExtracting(false);
      extractionRetriesRef.current = 0;
      Alert.alert('Extraction timeout', 'No response from the page. Reload and try again.');
    }, durationMs);
  };

  const stopExtractionTimeout = () => {
    if (extractionTimeoutRef.current) {
      clearTimeout(extractionTimeoutRef.current);
      extractionTimeoutRef.current = null;
    }
  };

  const canExtract = isRelevantExtractionUrl(platform, currentUrl);

  const handleExtract = () => {
    const wv = webViewRefs.current[activeTabId];
    if (!wv || isExtracting) return;
    if (!canExtract) {
      Alert.alert('Open correct page', getPlatformTip(platform));
      return;
    }
    setIsExtracting(true);
    extractionRetriesRef.current = 0;
    if (platform === 'swiggy') {
      startExtractionTimeout(30000);
      wv.injectJavaScript(getSwiggyPrefetchScrollScript());
    } else {
      startExtractionTimeout();
      wv.injectJavaScript(getScrapingInjectionScript(platform));
    }
  };

  const consumeSuccessPayload = (payload: unknown) => {
    const rawItems = Array.isArray(payload) ? payload : [];
    const transactions = dedupeTransactions(
      rawItems
        .filter((item) => typeof item === 'object' && item !== null)
        .map((item) => item as Record<string, unknown>)
        .map((item) => ({
          id: String(item.id ?? ''),
          platform,
          merchant: String(item.merchant ?? ''),
          amount: Number(item.amount ?? 0),
          date: String(item.date ?? 'Unknown Date'),
          category: PLATFORM_CATEGORIES[platform],
        }))
    );

    if (transactions.length === 0) {
      Alert.alert('No transactions found', 'Try browsing your orders/bookings page before extracting.');
      return;
    }

    setExtractedTransactions(transactions);
    navigation.navigate('ReviewTransactions', { platform });
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const raw = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        payload?: unknown;
        url?: string;
      };

      if (raw.type === 'swiggy_cookies' && platform === 'swiggy') {
        const cookies = (raw as { cookies?: string }).cookies;
        if (cookies && typeof cookies === 'string') {
          swiggyCookiesRef.current = cookies;
        }
        return;
      }

      if (raw.type === 'api_intercepted' && platform === 'swiggy') {
        const fromApi = parseSwiggyApiResponse(raw.payload);
        const merged = dedupeTransactions([...extractedTransactions, ...fromApi]);
        if (merged.length > 0) {
          setExtractedTransactions(merged);
          navigation.navigate('ReviewTransactions', { platform });
        }
        return;
      }

      if (raw.type === 'swiggy_prefetch_scroll_done') {
        webViewRefs.current[activeTabId]?.injectJavaScript(getScrapingInjectionScript('swiggy'));
        return;
      }

      const response = raw as {
        type: 'extraction_success' | 'extraction_error' | 'extraction_chunk' | 'extraction_chunk_complete';
        payload: unknown;
      };

      if (response.type === 'extraction_error') {
        stopExtractionTimeout();
        setIsExtracting(false);
        extractionRetriesRef.current = 0;
        Alert.alert('Extraction failed', String(response.payload));
        return;
      }

      if (response.type === 'extraction_chunk') {
        const chunkPayload = response.payload as {
          transferId?: string;
          index?: number;
          totalChunks?: number;
          chunk?: string;
        };
        const transferId = String(chunkPayload.transferId ?? '');
        if (!transferId) return;
        if (!chunkBufferRef.current[transferId]) {
          chunkBufferRef.current[transferId] = {
            totalChunks: Number(chunkPayload.totalChunks ?? 0),
            chunks: [],
          };
        }
        chunkBufferRef.current[transferId].chunks[Number(chunkPayload.index ?? 0)] = String(
          chunkPayload.chunk ?? ''
        );
        return;
      }

      if (response.type === 'extraction_chunk_complete') {
        const payload = response.payload as { transferId?: string };
        const transferId = String(payload.transferId ?? '');
        const chunked = chunkBufferRef.current[transferId];
        if (!chunked) throw new Error('Missing chunk buffer data');
        if (chunked.chunks.filter(Boolean).length !== chunked.totalChunks)
          throw new Error('Incomplete chunk transfer');
        const fullMessage = chunked.chunks.join('');
        delete chunkBufferRef.current[transferId];
        const reconstructed = JSON.parse(fullMessage) as { type: 'extraction_success'; payload: unknown };
        stopExtractionTimeout();
        setIsExtracting(false);
        extractionRetriesRef.current = 0;
        consumeSuccessPayload(reconstructed.payload);
        return;
      }

      stopExtractionTimeout();
      setIsExtracting(false);
      extractionRetriesRef.current = 0;
      consumeSuccessPayload(response.payload);
    } catch (error) {
      stopExtractionTimeout();
      setIsExtracting(false);
      extractionRetriesRef.current = 0;
      Alert.alert('Parsing error', String(error));
    }
  };

  const onNavigationStateChange = (tabId: string) => (state: WebViewNavigation) => {
    updateTab(tabId, {
      url: state.url,
      title: state.title || 'Page',
      canGoBack: state.canGoBack,
      canGoForward: state.canGoForward,
    });
  };

  const activeLoading = Boolean(tabLoading[activeTabId]);

  return (
    <View style={styles.container}>
      {activeLoading && (
        <View style={styles.loader}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.loaderText}>Loading…</Text>
        </View>
      )}

      <View style={styles.chromeTabRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {tabs.map((tab) => (
            <View
              key={tab.id}
              style={[styles.tabChip, activeTabId === tab.id && styles.tabChipActive]}
            >
              <Pressable
                style={styles.tabChipBody}
                onPress={() => {
                  setActiveTabId(tab.id);
                  setAddressFocused(false);
                }}
              >
                <Text
                  style={[styles.tabChipTitle, activeTabId === tab.id && styles.tabChipTitleActive]}
                  numberOfLines={1}
                >
                  {tab.title}
                </Text>
              </Pressable>
              {tabs.length > 1 && (
                <Pressable hitSlop={8} onPress={() => handleCloseTab(tab.id)} style={styles.tabClose}>
                  <Text style={styles.tabCloseText}>×</Text>
                </Pressable>
              )}
            </View>
          ))}
          <Pressable style={styles.newTabBtn} onPress={handleAddTab}>
            <Text style={styles.newTabBtnText}>＋</Text>
          </Pressable>
        </ScrollView>
      </View>

      <View style={styles.addressRow}>
        <TextInput
          style={styles.addressInput}
          value={addressInput}
          onChangeText={setAddressInput}
          onFocus={() => setAddressFocused(true)}
          onBlur={() => setAddressFocused(false)}
          placeholder="Search or enter URL"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={handleNavigateFromAddressBar}
        />
        <Pressable style={styles.goButton} onPress={handleNavigateFromAddressBar}>
          <Text style={styles.goButtonText}>Go</Text>
        </Pressable>
      </View>

      <View style={styles.tipBanner}>
        <Text style={styles.tipText}>{getPlatformTip(platform)}</Text>
        <Text style={styles.urlText} numberOfLines={1}>
          {currentUrl}
        </Text>
      </View>

      <View style={styles.toolbar}>
        <Pressable
          style={[styles.toolButton, !activeTab.canGoBack && styles.toolButtonDisabled]}
          disabled={!activeTab.canGoBack}
          onPress={() => webViewRefs.current[activeTabId]?.goBack()}
        >
          <Text style={styles.toolText}>Back</Text>
        </Pressable>
        <Pressable
          style={[styles.toolButton, !activeTab.canGoForward && styles.toolButtonDisabled]}
          disabled={!activeTab.canGoForward}
          onPress={() => webViewRefs.current[activeTabId]?.goForward()}
        >
          <Text style={styles.toolText}>Forward</Text>
        </Pressable>
        <Pressable style={styles.toolButton} onPress={() => webViewRefs.current[activeTabId]?.reload()}>
          <Text style={styles.toolText}>Reload</Text>
        </Pressable>
      </View>

      <View style={styles.altActions}>
        {platform === 'swiggy' && (
          <>
            <Pressable
              style={[styles.altBtnServer, isFetchingFromServer && styles.altBtnDisabled]}
              onPress={handleFetchFromServer}
              disabled={isFetchingFromServer}
            >
              {isFetchingFromServer ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.altBtnServerText}>Fetch orders via server</Text>
              )}
            </Pressable>
            <Pressable style={styles.altBtnPrimary} onPress={handleSwiggyFreshOrdersLoad}>
              <Text style={styles.altBtnPrimaryText}>Fresh load orders page</Text>
            </Pressable>
          </>
        )}
        <Pressable
          style={styles.altBtnSecondary}
          onPress={() => navigation.navigate('PasteTransactions', { platform })}
        >
          <Text style={styles.altBtnSecondaryText}>Paste orders (email / SMS / app copy)</Text>
        </Pressable>
      </View>

      <View style={styles.webViewStack}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const nonce = tabRemountNonce[tab.id] ?? 0;
          return (
            <View
              key={`${tab.id}-${nonce}`}
              style={[styles.webViewLayer, isActive ? styles.webViewLayerActive : styles.webViewLayerHidden]}
              pointerEvents={isActive ? 'auto' : 'none'}
            >
              <WebView
                ref={(r) => {
                  webViewRefs.current[tab.id] = r;
                }}
                style={styles.webView}
                source={{
                  uri: tab.url,
                  headers: { 'User-Agent': DESKTOP_BROWSER_USER_AGENT },
                }}
                userAgent={DESKTOP_BROWSER_USER_AGENT}
                injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
                javaScriptEnabled
                domStorageEnabled
                cacheEnabled
                sharedCookiesEnabled
                thirdPartyCookiesEnabled
                incognito={false}
                setSupportMultipleWindows={false}
                onShouldStartLoadWithRequest={handleShouldStartLoadWithRequestForTab(tab.id)}
                onLoadStart={() => setTabLoading((l) => ({ ...l, [tab.id]: true }))}
                onError={() => setTabLoading((l) => ({ ...l, [tab.id]: false }))}
                onHttpError={() => setTabLoading((l) => ({ ...l, [tab.id]: false }))}
                onLoadEnd={(e) => {
                  setTabLoading((l) => ({ ...l, [tab.id]: false }));
                  const ne = e.nativeEvent as { url?: string };
                  const loadedUrl = typeof ne.url === 'string' ? ne.url : tab.url;
                  const wv = webViewRefs.current[tab.id];
                  if (platform === 'swiggy') {
                    wv?.injectJavaScript(SWIGGY_API_INTERCEPTOR_JS);
                    wv?.injectJavaScript(SWIGGY_COOKIE_EXTRACT_JS);
                  }
                  if (isPartnerSiteUrl(loadedUrl)) {
                    wv?.injectJavaScript(REINJECT_VIEWPORT_JS);
                  }
                  if (platform === 'swiggy' && isPartnerSiteUrl(loadedUrl)) {
                    wv?.injectJavaScript(getSwiggyOrdersExpandOnlyScript());
                  }
                }}
                onNavigationStateChange={onNavigationStateChange(tab.id)}
                onMessage={handleMessage}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[styles.extractButton, (!canExtract || isExtracting) && styles.extractButtonDisabled]}
          onPress={handleExtract}
          disabled={!canExtract || isExtracting}
        >
          <Text style={styles.extractText}>{isExtracting ? 'Extracting...' : 'Extract Transactions'}</Text>
        </Pressable>
        <View style={[styles.badge, canExtract ? styles.badgeReady : styles.badgeBlocked]}>
          <Text style={[styles.badgeText, canExtract ? styles.badgeTextReady : styles.badgeTextBlocked]}>
            {canExtract ? 'On orders/bookings page' : 'Not on orders/bookings page'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  loader: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    zIndex: 20,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loaderText: { color: '#4B5563' },
  chromeTabRow: {
    backgroundColor: '#E5E7EB',
    paddingTop: 6,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D1D5DB',
  },
  tabScroll: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6 },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 160,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    overflow: 'hidden',
  },
  tabChipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#2563EB',
  },
  tabChipBody: { flex: 1, paddingVertical: 8, paddingLeft: 10, paddingRight: 4, minWidth: 0 },
  tabChipTitle: { color: '#374151', fontSize: 13, fontWeight: '600' },
  tabChipTitleActive: { color: '#1D4ED8' },
  tabClose: { marginLeft: 4, paddingHorizontal: 4 },
  tabCloseText: { fontSize: 18, color: '#6B7280', fontWeight: '400', lineHeight: 20 },
  newTabBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newTabBtnText: { fontSize: 20, color: '#1F2937', fontWeight: '600' },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 6,
  },
  addressInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: '#111827',
  },
  goButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  goButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  tipBanner: { marginHorizontal: 10, marginBottom: 8, backgroundColor: '#E0EAFF', borderRadius: 8, padding: 10 },
  tipText: { color: '#1E3A8A', fontWeight: '600', marginBottom: 4 },
  urlText: { color: '#374151', fontSize: 12 },
  toolbar: { flexDirection: 'row', gap: 8, marginHorizontal: 10, marginBottom: 8 },
  toolButton: { flex: 1, backgroundColor: '#1F2937', borderRadius: 8, alignItems: 'center', paddingVertical: 10 },
  toolButtonDisabled: { opacity: 0.45 },
  toolText: { color: '#FFFFFF', fontWeight: '600' },
  altActions: { marginHorizontal: 10, marginBottom: 8, gap: 8 },
  altBtnServer: {
    backgroundColor: '#16A34A',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  altBtnServerText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  altBtnDisabled: { opacity: 0.6 },
  altBtnPrimary: {
    backgroundColor: '#1D4ED8',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  altBtnPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  altBtnSecondary: {
    backgroundColor: '#E0EAFF',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  altBtnSecondaryText: { color: '#1E3A8A', fontWeight: '700', fontSize: 13 },
  webViewStack: { flex: 1, position: 'relative' },
  webViewLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  webViewLayerHidden: {
    opacity: 0,
    zIndex: 0,
  },
  webViewLayerActive: {
    opacity: 1,
    zIndex: 1,
  },
  webView: { flex: 1 },
  footer: {
    marginTop: 0,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  extractButton: { backgroundColor: '#2563EB', paddingVertical: 14, alignItems: 'center' },
  extractButtonDisabled: { backgroundColor: '#93C5FD' },
  extractText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  badge: { paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  badgeReady: { backgroundColor: '#DCFCE7' },
  badgeBlocked: { backgroundColor: '#FEF3C7' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextReady: { color: '#166534' },
  badgeTextBlocked: { color: '#92400E' },
});
