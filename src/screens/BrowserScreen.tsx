import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { useAppContext } from '../hooks/useAppContext';
import { PlatformId, RootStackParamList, Transaction } from '../types';
import {
  dedupeTransactions,
  EMBEDDED_BROWSER_ENTRY_URL,
  getPlatformTip,
  getScrapingInjectionScript,
  getSwiggyPrefetchScrollScript,
  isRelevantExtractionUrl,
} from '../utils/scraping';

type Props = NativeStackScreenProps<RootStackParamList, 'Browser'>;

const PLATFORM_CATEGORIES: Record<PlatformId, Transaction['category']> = {
  swiggy: 'food',
  zomato: 'food',
  makemytrip: 'travel',
};

/**
 * Desktop UA + first-request headers (Android can load before `userAgent` prop applies).
 * iOS uses Safari-on-macOS so the string matches WebKit; Android uses desktop Chrome on Windows.
 */
const DESKTOP_BROWSER_USER_AGENT = Platform.select({
  ios: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  default:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
})!;

/** Layout viewport width so CSS breakpoints match desktop (narrow WebView still reports ~device-width otherwise). */
const DESKTOP_LAYOUT_VIEWPORT_WIDTH = 1280;
/** Zoom out so ~1280px layout fits typical phone width (~0.32 * 1280 ≈ 410). */
const DESKTOP_LAYOUT_INITIAL_SCALE = 0.32;

/**
 * Before any page script runs: fake no-touch desktop, force a wide layout viewport.
 * Swiggy post-login often reapplies `width=device-width`, which hides the desktop order list.
 */
const DESKTOP_SITE_BOOTSTRAP_JS = `(function(){
  try{Object.defineProperty(Navigator.prototype,'maxTouchPoints',{get:function(){return 0},configurable:true});}catch(e){}
  function forceDesktopViewport(){
    try{
      var head=document.head||document.getElementsByTagName('head')[0]||document.documentElement;
      var v=document.querySelector('meta[name="viewport"]');
      if(!v){v=document.createElement('meta');v.setAttribute('name','viewport');head.insertBefore(v,head.firstChild);}
      v.setAttribute('content','width=${DESKTOP_LAYOUT_VIEWPORT_WIDTH}, initial-scale=${DESKTOP_LAYOUT_INITIAL_SCALE}, minimum-scale=0.2, maximum-scale=3, user-scalable=yes');
    }catch(e){}
  }
  forceDesktopViewport();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',forceDesktopViewport);
})();true;`;

/** Re-apply after load — SPAs sometimes replace <meta name="viewport"> after hydration. */
const SWIGGY_DESKTOP_VIEWPORT_REINJECT_JS = `(function(){
  try{
    var head=document.head||document.getElementsByTagName('head')[0]||document.documentElement;
    var v=document.querySelector('meta[name="viewport"]');
    if(!v){v=document.createElement('meta');v.setAttribute('name','viewport');head.insertBefore(v,head.firstChild);}
    v.setAttribute('content','width=${DESKTOP_LAYOUT_VIEWPORT_WIDTH}, initial-scale=${DESKTOP_LAYOUT_INITIAL_SCALE}, minimum-scale=0.2, maximum-scale=3, user-scalable=yes');
  }catch(e){}
})();true;`;

function swiggyDesktopUrlIfNeeded(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/\.swiggy\.com$/i.test(parsed.hostname)) {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (host === 'www.swiggy.com' || host === 'swiggy.com') {
      return null;
    }
    if (host === 'm.swiggy.com' || host === 'mobile.swiggy.com') {
      parsed.hostname = 'www.swiggy.com';
      return parsed.toString();
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function BrowserScreen({ route, navigation }: Props) {
  const { platform } = route.params;
  const webViewRef = useRef<WebView>(null);
  const extractionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extractionRetriesRef = useRef(0);
  const chunkBufferRef = useRef<Record<string, { totalChunks: number; chunks: string[] }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(EMBEDDED_BROWSER_ENTRY_URL[platform]);
  /** After OAuth, Swiggy may redirect to m.swiggy.com; rewrite to www so we stay on desktop. */
  const [swiggyUriRewrite, setSwiggyUriRewrite] = useState<string | null>(null);
  const { setExtractedTransactions } = useAppContext();

  const entryUri = EMBEDDED_BROWSER_ENTRY_URL[platform];
  const source = useMemo(
    () => ({
      uri: platform === 'swiggy' && swiggyUriRewrite ? swiggyUriRewrite : entryUri,
      headers: {
        'User-Agent': DESKTOP_BROWSER_USER_AGENT,
      },
    }),
    [platform, swiggyUriRewrite, entryUri]
  );

  const handleShouldStartLoadWithRequest = (req: { url: string; isTopFrame: boolean }) => {
    if (platform !== 'swiggy' || !req.isTopFrame) {
      return true;
    }
    const desktopUrl = swiggyDesktopUrlIfNeeded(req.url);
    if (desktopUrl) {
      setSwiggyUriRewrite(desktopUrl);
      return false;
    }
    return true;
  };
  const canExtract = isRelevantExtractionUrl(platform, currentUrl);

  useEffect(() => {
    return () => {
      if (extractionTimeoutRef.current) {
        clearTimeout(extractionTimeoutRef.current);
      }
    };
  }, []);

  const startExtractionTimeout = (durationMs = 9000) => {
    if (extractionTimeoutRef.current) {
      clearTimeout(extractionTimeoutRef.current);
    }

    extractionTimeoutRef.current = setTimeout(() => {
      if (extractionRetriesRef.current < 1 && webViewRef.current) {
        extractionRetriesRef.current += 1;
        startExtractionTimeout(durationMs);
        webViewRef.current.injectJavaScript(getScrapingInjectionScript(platform));
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

  const handleExtract = () => {
    if (!webViewRef.current || isExtracting) {
      return;
    }
    if (!canExtract) {
      Alert.alert('Open correct page', getPlatformTip(platform));
      return;
    }
    setIsExtracting(true);
    extractionRetriesRef.current = 0;
    if (platform === 'swiggy') {
      startExtractionTimeout(26000);
      webViewRef.current.injectJavaScript(getSwiggyPrefetchScrollScript());
    } else {
      startExtractionTimeout();
      webViewRef.current.injectJavaScript(getScrapingInjectionScript(platform));
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
      const raw = JSON.parse(event.nativeEvent.data) as { type?: string; payload?: unknown };

      if (raw.type === 'swiggy_prefetch_scroll_done') {
        webViewRef.current?.injectJavaScript(getScrapingInjectionScript('swiggy'));
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
        if (!transferId) {
          return;
        }

        if (!chunkBufferRef.current[transferId]) {
          chunkBufferRef.current[transferId] = {
            totalChunks: Number(chunkPayload.totalChunks ?? 0),
            chunks: [],
          };
        }

        chunkBufferRef.current[transferId].chunks[Number(chunkPayload.index ?? 0)] = String(chunkPayload.chunk ?? '');
        return;
      }

      if (response.type === 'extraction_chunk_complete') {
        const payload = response.payload as { transferId?: string };
        const transferId = String(payload.transferId ?? '');
        const chunked = chunkBufferRef.current[transferId];
        if (!chunked) {
          throw new Error('Missing chunk buffer data');
        }
        if (chunked.chunks.filter(Boolean).length !== chunked.totalChunks) {
          throw new Error('Incomplete chunk transfer');
        }

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

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loader}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.loaderText}>Loading browser...</Text>
        </View>
      )}

      <View style={styles.tipBanner}>
        <Text style={styles.tipText}>{getPlatformTip(platform)}</Text>
        <Text style={styles.urlText} numberOfLines={1}>
          {currentUrl}
        </Text>
      </View>

      <View style={styles.toolbar}>
        <Pressable
          style={[styles.toolButton, !canGoBack && styles.toolButtonDisabled]}
          disabled={!canGoBack}
          onPress={() => webViewRef.current?.goBack()}
        >
          <Text style={styles.toolText}>Back</Text>
        </Pressable>
        <Pressable
          style={[styles.toolButton, !canGoForward && styles.toolButtonDisabled]}
          disabled={!canGoForward}
          onPress={() => webViewRef.current?.goForward()}
        >
          <Text style={styles.toolText}>Forward</Text>
        </Pressable>
        <Pressable style={styles.toolButton} onPress={() => webViewRef.current?.reload()}>
          <Text style={styles.toolText}>Reload</Text>
        </Pressable>
      </View>

      <WebView
        ref={webViewRef}
        style={styles.webView}
        source={source}
        userAgent={DESKTOP_BROWSER_USER_AGENT}
        injectedJavaScriptBeforeContentLoaded={DESKTOP_SITE_BOOTSTRAP_JS}
        injectedJavaScript={platform === 'swiggy' ? SWIGGY_DESKTOP_VIEWPORT_REINJECT_JS : undefined}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onLoadEnd={() => {
          setIsLoading(false);
          if (platform === 'swiggy') {
            webViewRef.current?.injectJavaScript(SWIGGY_DESKTOP_VIEWPORT_REINJECT_JS);
          }
        }}
        onNavigationStateChange={(state) => {
          setCanGoBack(state.canGoBack);
          setCanGoForward(state.canGoForward);
          setCurrentUrl(state.url);
        }}
        onMessage={handleMessage}
      />

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
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loader: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    zIndex: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loaderText: {
    color: '#4B5563',
  },
  tipBanner: {
    marginHorizontal: 10,
    marginBottom: 8,
    backgroundColor: '#E0EAFF',
    borderRadius: 8,
    padding: 10,
  },
  tipText: {
    color: '#1E3A8A',
    fontWeight: '600',
    marginBottom: 4,
  },
  urlText: {
    color: '#374151',
    fontSize: 12,
  },
  toolbar: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 10,
    marginBottom: 8,
  },
  toolButton: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  toolButtonDisabled: {
    opacity: 0.45,
  },
  toolText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  webView: {
    flex: 1,
  },
  footer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  extractButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    alignItems: 'center',
  },
  extractButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  extractText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  badge: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeReady: {
    backgroundColor: '#DCFCE7',
  },
  badgeBlocked: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeTextReady: {
    color: '#166534',
  },
  badgeTextBlocked: {
    color: '#92400E',
  },
});
