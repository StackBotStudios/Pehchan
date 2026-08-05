export type PlatformId = 'swiggy' | 'zomato' | 'makemytrip';

export interface UserSession {
  name: string;
  isLoggedIn: boolean;
}

export interface SwiggyCredentials {
  mobile: string;
}

export interface SwiggyOrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface SwiggyOrderCharges {
  itemTotal: number;
  deliveryFee: number;
  packagingFee: number;
  platformFee: number;
  taxes: number;
  discount: number;
  couponDiscount: number;
  extraDiscount: number;
  paidAmount: number;
}

export interface SwiggyOrder {
  orderId: string;
  restaurantName: string;
  restaurantCuisine?: string;
  restaurantArea?: string;
  orderDate: string;
  orderTotal: number;
  items: SwiggyOrderItem[];
  status: string;
  paymentMethod?: string;
  charges?: SwiggyOrderCharges;
  deliveryAddress?: string;
  deliveryPartner?: string;
  couponCode?: string;
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
  SwiggyAutoLogin: undefined;
  SwiggyAnalytics: undefined;
};
