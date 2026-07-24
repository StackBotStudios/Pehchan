import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { useAppContext } from '../hooks/useAppContext';
import { parseSwiggyOrders } from '../utils/swiggyParser';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'SwiggyAutoLogin'>;

type Phase =
  | 'loading_page'
  | 'waiting_for_login'
  | 'fetching_orders'
  | 'done'
  | 'error';

const SWIGGY_HOME_URL = 'https://www.swiggy.com';

/**
 * Injected into every page load. Intercepts Swiggy's internal order API calls
 * and posts the raw JSON back to React Native.
 */
const API_INTERCEPTOR_JS = `
(function() {
  if (window.__pehchanInterceptorInstalled) return;
  window.__pehchanInterceptorInstalled = true;

  function shouldCapture(url) {
    return url.includes('/dapi/order/all') ||
           url.includes('/order/history') ||
           url.includes('/dapi/order/details') ||
           url.includes('/order/track');
  }

  function getType(url) {
    if (url.includes('/dapi/order/details') || url.includes('/order/track')) return 'swiggy_order_detail_api';
    return 'swiggy_orders_api';
  }

  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    const response = await originalFetch(...args);
    if (shouldCapture(url)) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: getType(url), data: text, url }));
      } catch(e) {}
    }
    return response;
  };

  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._pehchanUrl = url;
    return originalXHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', function() {
      if (this._pehchanUrl && shouldCapture(this._pehchanUrl)) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: getType(this._pehchanUrl), data: this.responseText, url: this._pehchanUrl }));
        } catch(e) {}
      }
    });
    return originalXHRSend.apply(this, arguments);
  };
})();
true;
`;

/**
 * After page settles, check if user is logged in and auto-fetch orders.
 * Detects login via cookie (tid/sid) or DOM markers.
 */
const CHECK_AUTH_AND_TRIGGER_JS = `
(function() {
  const cookies = document.cookie;
  const isLoggedIn = !!(
    cookies.includes('_sid=') ||
    cookies.includes('tid=') ||
    cookies.match(/sid=[^;]{8}/) ||
    document.querySelector('[class*="profile"]') ||
    document.querySelector('[href*="my-account"]') ||
    document.querySelector('[href*="logout"]') ||
    document.querySelector('[data-testid*="profile"]')
  );

  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'auth_check',
    isLoggedIn,
    url: window.location.href,
    cookies: cookies.substring(0, 200)
  }));

  if (isLoggedIn) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'fetching_orders' }));
    fetch('https://www.swiggy.com/dapi/order/all?order_id=&offset=0&limit=200', {
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' }
    })
    .then(r => r.text())
    .then(text => {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'swiggy_orders_api', data: text }));
      // Also fetch details for each order
      try {
        const parsed = JSON.parse(text);
        const orders = (parsed && parsed.data && parsed.data.orders) || [];
        orders.slice(0, 50).forEach(function(order) {
          const oid = order.order_id || order.orderId;
          if (!oid) return;
          setTimeout(function() {
            fetch('https://www.swiggy.com/dapi/order/details?order_id=' + oid, {
              credentials: 'include',
              headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' }
            })
            .then(r => r.text())
            .then(detailText => {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'swiggy_order_detail_api', orderId: oid, data: detailText }));
            })
            .catch(function() {});
          }, 100);
        });
      } catch(e) {}
    })
    .catch(err => {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'fetch_error', error: err.toString() }));
    });
  }
})();
true;
`;

const VIEWPORT_JS = `
(function() {
  var meta = document.querySelector('meta[name=viewport]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.appendChild(meta); }
  meta.content = 'width=1280, initial-scale=0.32, user-scalable=no';
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
})();
true;
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeOrderDetail(order: import('../types').SwiggyOrder, detail: Record<string, any>): import('../types').SwiggyOrder {
  const d = detail?.data?.order ?? detail?.data ?? detail;
  if (!d) return order;

  const billing = d.order_payment_summary ?? d.billing ?? {};
  const safeN = (v: unknown) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const n = parseFloat(v.replace(/[^\d.]/g, '')); return isNaN(n) ? 0 : n; }
    return 0;
  };

  const charges: import('../types').SwiggyOrderCharges = {
    itemTotal: safeN(billing.itemTotal ?? billing.sub_total ?? d.order_sub_total),
    deliveryFee: safeN(billing.deliveryFee ?? billing.delivery_fee ?? d.delivery_fee),
    packagingFee: safeN(billing.packagingFee ?? billing.packaging_charges ?? billing.restaurantPackaging),
    platformFee: safeN(billing.platformFee ?? billing.platform_fee),
    taxes: safeN(billing.gst ?? billing.taxes ?? billing.tax_amount),
    discount: safeN(billing.discount ?? billing.total_discount),
    couponDiscount: safeN(billing.coupon_discount ?? billing.couponDiscount ?? billing.offer_discount),
    extraDiscount: safeN(billing.extra_discount ?? billing.extraDiscount),
    paidAmount: safeN(billing.order_total ?? billing.orderTotal ?? billing.total_amount ?? order.orderTotal),
  };

  return {
    ...order,
    charges,
    deliveryAddress: (d.delivery_address?.address ?? d.delivery_address?.annotation ?? order.deliveryAddress) || undefined,
    deliveryPartner: (d.delivery_boy?.name ?? d.delivery_partner?.name ?? order.deliveryPartner) || undefined,
    couponCode: (d.coupon_code ?? d.order_discount_description ?? order.couponCode) || undefined,
    restaurantArea: (d.restaurant?.area_name ?? d.restaurant?.locality ?? order.restaurantArea) || undefined,
  };
}

export function SwiggyAutoLoginScreen({ navigation }: Props) {
  const { swiggyCredentials, setSwiggyOrders } = useAppContext();
  const webviewRef = useRef<WebView>(null);
  const [phase, setPhase] = useState<Phase>('loading_page');
  const [statusText, setStatusText] = useState('Opening Swiggy…');
  const ordersReceivedRef = useRef(false);
  const authCheckCountRef = useRef(0);
  const parsedOrdersRef = useRef<import('../types').SwiggyOrder[]>([]);
  const detailsReceivedRef = useRef<Set<string>>(new Set());

  const finalize = useCallback(
    (orders: import('../types').SwiggyOrder[]) => {
      if (orders.length === 0) {
        setPhase('waiting_for_login');
        setStatusText('Could not find orders. Please log in to Swiggy and try again.');
        return;
      }
      parsedOrdersRef.current = orders;
      setSwiggyOrders(orders);
      setPhase('done');
      setStatusText(`Synced ${orders.length} orders!`);
      setTimeout(() => navigation.replace('SwiggyAnalytics'), 1200);
    },
    [navigation, setSwiggyOrders]
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as {
          type: string;
          data?: string;
          isLoggedIn?: boolean;
          url?: string;
          orderId?: string;
        };

        if (msg.type === 'fetching_orders') {
          setPhase('fetching_orders');
          setStatusText('Fetching your order history…');
        }

        if (msg.type === 'auth_check') {
          authCheckCountRef.current += 1;
          if (msg.isLoggedIn) {
            setPhase('fetching_orders');
            setStatusText('Fetching your order history…');
          } else if (authCheckCountRef.current >= 2) {
            setPhase('waiting_for_login');
            setStatusText('Please log in to Swiggy to continue');
          }
        }

        if (msg.type === 'swiggy_orders_api' && msg.data && !ordersReceivedRef.current) {
          ordersReceivedRef.current = true;
          try {
            const parsed = parseSwiggyOrders(msg.data);
            if (parsed.length === 0) {
              setPhase('waiting_for_login');
              setStatusText('Could not find orders. Please log in to Swiggy and try again.');
              return;
            }
            // Navigate immediately — detail enrichment happens in background
            finalize(parsed);
          } catch {
            setPhase('error');
            setStatusText('Failed to parse order data. Please try again.');
          }
        }

        if (msg.type === 'swiggy_order_detail_api' && msg.data) {
          const orderId = msg.orderId || '';
          if (orderId && !detailsReceivedRef.current.has(orderId)) {
            detailsReceivedRef.current.add(orderId);
            try {
              const detail = JSON.parse(msg.data);
              parsedOrdersRef.current = parsedOrdersRef.current.map(o => {
                if (o.orderId !== orderId) return o;
                return mergeOrderDetail(o, detail);
              });
            } catch { /* ignore bad detail */ }
          }
        }
      } catch {
        // non-JSON message, ignore
      }
    },
    [finalize]
  );

  const handleLoadEnd = useCallback(() => {
    setTimeout(() => {
      webviewRef.current?.injectJavaScript(CHECK_AUTH_AND_TRIGGER_JS);
    }, 2500);
  }, []);

  const handleNavigationStateChange = useCallback((navState: { url: string }) => {
    // Re-run auth check after every navigation (catches post-login redirects)
    if (ordersReceivedRef.current) return;
    setTimeout(() => {
      webviewRef.current?.injectJavaScript(CHECK_AUTH_AND_TRIGGER_JS);
    }, 3000);
  }, []);

  if (!swiggyCredentials) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.errorText}>No Swiggy credentials found. Please go back and connect.</Text>
      </View>
    );
  }

  const showOverlay = phase !== 'waiting_for_login';

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ uri: SWIGGY_HOME_URL }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        injectedJavaScriptBeforeContentLoaded={VIEWPORT_JS + '\n' + API_INTERCEPTOR_JS}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
        onNavigationStateChange={handleNavigationStateChange}
        userAgent={
          Platform.OS === 'ios'
            ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15'
            : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        onError={() => {
          setPhase('error');
          setStatusText('Failed to load Swiggy. Check your internet connection.');
        }}
      />

      {showOverlay && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.statusCard}>
            <View style={styles.swiggyBadge}>
              <Text style={styles.swiggyBadgeText}>Swiggy</Text>
            </View>
            {phase !== 'done' && phase !== 'error' && (
              <ActivityIndicator size="large" color="#FC8019" style={styles.spinner} />
            )}
            {phase === 'done' && <Text style={styles.doneIcon}>✓</Text>}
            {phase === 'error' && <Text style={styles.errorIcon}>✕</Text>}
            <Text style={styles.statusText}>{statusText}</Text>
            {phase === 'error' && (
              <Text
                style={styles.retryText}
                onPress={() => {
                  ordersReceivedRef.current = false;
                  authCheckCountRef.current = 0;
                  setPhase('loading_page');
                  setStatusText('Opening Swiggy…');
                  webviewRef.current?.reload();
                }}
              >
                Tap to retry
              </Text>
            )}
          </View>
        </View>
      )}

      {phase === 'waiting_for_login' && (
        <View style={styles.loginBanner}>
          <Text style={styles.loginBannerText}>
            Log in to Swiggy above, then come back here — orders will sync automatically.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorText: { color: '#EF4444', textAlign: 'center', fontSize: 16 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    minWidth: 240,
  },
  swiggyBadge: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  swiggyBadgeText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  spinner: { marginBottom: 16 },
  doneIcon: { fontSize: 40, color: '#10B981', marginBottom: 12 },
  errorIcon: { fontSize: 40, color: '#EF4444', marginBottom: 12 },
  statusText: { color: '#374151', fontSize: 15, textAlign: 'center', fontWeight: '500' },
  retryText: {
    marginTop: 16,
    color: '#FC8019',
    fontWeight: '600',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
  loginBanner: {
    backgroundColor: '#FC8019',
    padding: 14,
    paddingHorizontal: 20,
  },
  loginBannerText: {
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 13,
  },
});
