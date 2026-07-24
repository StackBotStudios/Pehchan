import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNode, createContext, useEffect, useMemo, useState } from 'react';

import { SwiggyCredentials, SwiggyOrder, Transaction, UserSession } from '../types';
import { dedupeTransactions } from '../utils/scraping';

interface AppContextValue {
  user: UserSession | null;
  transactions: Transaction[];
  extractedTransactions: Transaction[];
  swiggyCredentials: SwiggyCredentials | null;
  swiggyOrders: SwiggyOrder[];
  login: (name: string) => void;
  logout: () => void;
  setExtractedTransactions: (items: Transaction[]) => void;
  updateExtractedTransaction: (transactionId: string, update: Partial<Transaction>) => void;
  removeExtractedTransaction: (transactionId: string) => void;
  confirmExtractedTransactions: () => void;
  saveSwiggyCredentials: (creds: SwiggyCredentials) => void;
  clearSwiggyCredentials: () => void;
  setSwiggyOrders: (orders: SwiggyOrder[]) => void;
}

const STORAGE_KEYS = {
  user: 'pehchan:user',
  transactions: 'pehchan:transactions',
  swiggyCredentials: 'pehchan:swiggy_credentials',
  swiggyOrders: 'pehchan:swiggy_orders',
};

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [extractedTransactions, setExtractedTransactionsState] = useState<Transaction[]>([]);
  const [swiggyCredentials, setSwiggyCredentialsState] = useState<SwiggyCredentials | null>(null);
  const [swiggyOrders, setSwiggyOrdersState] = useState<SwiggyOrder[]>([]);
  const [storageHydrated, setStorageHydrated] = useState(false);

  useEffect(() => {
    async function hydrate() {
      try {
        const [userValue, transactionsValue, swiggyCredsValue, swiggyOrdersValue] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.user),
          AsyncStorage.getItem(STORAGE_KEYS.transactions),
          AsyncStorage.getItem(STORAGE_KEYS.swiggyCredentials),
          AsyncStorage.getItem(STORAGE_KEYS.swiggyOrders),
        ]);

        if (userValue) {
          try {
            const parsed: unknown = JSON.parse(userValue);
            if (
              parsed &&
              typeof parsed === 'object' &&
              'isLoggedIn' in parsed &&
              (parsed as UserSession).isLoggedIn
            ) {
              setUser(parsed as UserSession);
            }
          } catch {
            console.warn('Ignoring corrupt stored user session');
          }
        }
        if (transactionsValue) {
          try {
            const parsed: unknown = JSON.parse(transactionsValue);
            if (Array.isArray(parsed)) {
              setTransactions(parsed as Transaction[]);
            }
          } catch {
            console.warn('Ignoring corrupt stored transactions');
          }
        }
        if (swiggyCredsValue) {
          try {
            const parsed: unknown = JSON.parse(swiggyCredsValue);
            if (parsed && typeof parsed === 'object' && 'mobile' in parsed) {
              setSwiggyCredentialsState(parsed as SwiggyCredentials);
            }
          } catch {
            console.warn('Ignoring corrupt swiggy credentials');
          }
        }
        if (swiggyOrdersValue) {
          try {
            const parsed: unknown = JSON.parse(swiggyOrdersValue);
            if (Array.isArray(parsed)) {
              setSwiggyOrdersState(parsed as SwiggyOrder[]);
            }
          } catch {
            console.warn('Ignoring corrupt swiggy orders');
          }
        }
      } catch (error) {
        console.warn('Failed to hydrate local app state', error);
      } finally {
        setStorageHydrated(true);
      }
    }

    void hydrate();
  }, []);

  useEffect(() => {
    if (!storageHydrated) {
      return;
    }
    AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user)).catch(() => {
      console.warn('Failed to persist user');
    });
  }, [user, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) {
      return;
    }
    AsyncStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions)).catch(() => {
      console.warn('Failed to persist transactions');
    });
  }, [transactions, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    AsyncStorage.setItem(STORAGE_KEYS.swiggyCredentials, JSON.stringify(swiggyCredentials)).catch(() => {
      console.warn('Failed to persist swiggy credentials');
    });
  }, [swiggyCredentials, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    AsyncStorage.setItem(STORAGE_KEYS.swiggyOrders, JSON.stringify(swiggyOrders)).catch(() => {
      console.warn('Failed to persist swiggy orders');
    });
  }, [swiggyOrders, storageHydrated]);

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      transactions,
      extractedTransactions,
      swiggyCredentials,
      swiggyOrders,
      login: (name: string) =>
        setUser({
          name,
          isLoggedIn: true,
        }),
      logout: () => {
        setUser(null);
        setExtractedTransactionsState([]);
      },
      setExtractedTransactions: (items: Transaction[]) => {
        setExtractedTransactionsState(dedupeTransactions(items));
      },
      updateExtractedTransaction: (transactionId, update) => {
        setExtractedTransactionsState((prev) =>
          prev.map((item) => (item.id === transactionId ? { ...item, ...update } : item))
        );
      },
      removeExtractedTransaction: (transactionId) => {
        setExtractedTransactionsState((prev) => prev.filter((item) => item.id !== transactionId));
      },
      confirmExtractedTransactions: () => {
        setTransactions((prev) => dedupeTransactions([...prev, ...extractedTransactions]));
        setExtractedTransactionsState([]);
      },
      saveSwiggyCredentials: (creds: SwiggyCredentials) => {
        setSwiggyCredentialsState(creds);
      },
      clearSwiggyCredentials: () => {
        setSwiggyCredentialsState(null);
        setSwiggyOrdersState([]);
      },
      setSwiggyOrders: (orders: SwiggyOrder[]) => {
        setSwiggyOrdersState(orders);
      },
    }),
    [user, transactions, extractedTransactions, swiggyCredentials, swiggyOrders]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
