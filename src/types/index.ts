export type PlatformId = 'swiggy' | 'zomato' | 'makemytrip';

export interface UserSession {
  name: string;
  isLoggedIn: boolean;
}

export interface Transaction {
  id: string;
  platform: PlatformId;
  merchant: string;
  amount: number;
  date: string;
  category: 'food' | 'travel' | 'other';
}

export type RootStackParamList = {
  Login: undefined;
  Dashboard: undefined;
  PlatformConnect: undefined;
  Browser: { platform: PlatformId };
  PasteTransactions: { platform: PlatformId };
  ReviewTransactions: { platform: PlatformId };
};
