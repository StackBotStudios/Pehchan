import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNode, createContext, useEffect, useMemo, useState } from 'react';

import { Transaction, UserSession } from '../types';
import { dedupeTransactions } from '../utils/scraping';

interface AppContextValue {
  user: UserSession | null;
  transactions: Transaction[];
  extractedTransactions: Transaction[];
  login: (name: string) => void;
  logout: () => void;
  setExtractedTransactions: (items: Transaction[]) => void;
  updateExtractedTransaction: (transactionId: string, update: Partial<Transaction>) => void;
  removeExtractedTransaction: (transactionId: string) => void;
  confirmExtractedTransactions: () => void;
}

const STORAGE_KEYS = {
  user: 'pehchan:user',
  transactions: 'pehchan:transactions',
};

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [extractedTransactions, setExtractedTransactionsState] = useState<Transaction[]>([]);
  const [storageHydrated, setStorageHydrated] = useState(false);

  useEffect(() => {
    async function hydrate() {
      try {
        const [userValue, transactionsValue] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.user),
          AsyncStorage.getItem(STORAGE_KEYS.transactions),
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

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      transactions,
      extractedTransactions,
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
    }),
    [user, transactions, extractedTransactions]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
