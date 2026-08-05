import { SwiggyOrder, SwiggyOrderItem } from '../types';

/**
 * Parses raw JSON from Swiggy's /dapi/order/all API into SwiggyOrder objects.
 * Swiggy's API shape (as observed):
 * {
 *   statusCode: 0,
 *   data: {
 *     orders: [
 *       {
 *         order_id: string,
 *         restaurant_name: string,
 *         order_total: number,
 *         order_time: string,   // "2024-01-15 19:23:10"
 *         order_status: string,
 *         payment_method: string,
 *         order_items: [{ name, quantity, base_price }],
 *         restaurant_cuisine: string,
 *       }
 *     ]
 *   }
 * }
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

function safeStr(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

function safeNum(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = parseFloat(val.replace(/[^\d.]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function parseOrderItems(rawItems: unknown): SwiggyOrderItem[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((item: unknown): SwiggyOrderItem | null => {
      const i = item as AnyObj;
      const name = safeStr(i.name || i.item_name || i.title);
      if (!name) return null;
      return {
        name,
        quantity: safeNum(i.quantity || i.qty || 1),
        price: safeNum(i.base_price || i.price || i.item_total || 0),
      };
    })
    .filter((x): x is SwiggyOrderItem => x !== null);
}

function parseOrderDate(raw: unknown): string {
  const s = safeStr(raw);
  if (!s) return '';
  // Swiggy format: "2024-01-15 19:23:10" or ISO
  const d = new Date(s.replace(' ', 'T'));
  if (isNaN(d.getTime())) return s;
  return d.toISOString().split('T')[0] ?? s;
}

function extractOrdersArray(parsed: AnyObj): AnyObj[] {
  // Try multiple known shapes
  if (Array.isArray(parsed)) return parsed as AnyObj[];
  if (parsed.data?.orders && Array.isArray(parsed.data.orders)) return parsed.data.orders as AnyObj[];
  if (parsed.data?.order_history && Array.isArray(parsed.data.order_history)) return parsed.data.order_history as AnyObj[];
  if (parsed.orders && Array.isArray(parsed.orders)) return parsed.orders as AnyObj[];
  // Walk one level deeper
  for (const key of Object.keys(parsed)) {
    const val = parsed[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const subKey of Object.keys(val as AnyObj)) {
        const subVal = (val as AnyObj)[subKey];
        if (Array.isArray(subVal) && subVal.length > 0 && (subVal[0] as AnyObj).order_id) {
          return subVal as AnyObj[];
        }
      }
    }
  }
  return [];
}

export function parseSwiggyOrders(rawJson: string): SwiggyOrder[] {
  let parsed: AnyObj;
  try {
    parsed = JSON.parse(rawJson) as AnyObj;
  } catch {
    return [];
  }

  const rawOrders = extractOrdersArray(parsed);
  if (rawOrders.length === 0) return [];

  return rawOrders
    .map((o): SwiggyOrder | null => {
      const orderId = safeStr(o.order_id || o.orderId || o.id);
      if (!orderId) return null;

      const restaurantName = safeStr(
        o.restaurant_name || o.restaurantName || o.restaurant?.name || 'Unknown Restaurant'
      );
      const orderTotal = safeNum(
        o.order_total || o.orderTotal || o.total_amount || o.bill_total || 0
      );
      const orderDate = parseOrderDate(
        o.order_time || o.orderTime || o.placed_time || o.created_at
      );
      const status = safeStr(o.order_status || o.orderStatus || o.status || 'Delivered');
      const paymentMethod = safeStr(
        o.payment_method || o.paymentMethod || o.transaction_method || ''
      );
      const cuisine = safeStr(
        o.restaurant_cuisine || o.cuisine || o.restaurant?.cuisine_string || ''
      );

      const items = parseOrderItems(
        o.order_items || o.orderItems || o.items || []
      );

      return {
        orderId,
        restaurantName,
        restaurantCuisine: cuisine || undefined,
        orderDate,
        orderTotal,
        items,
        status,
        paymentMethod: paymentMethod || undefined,
      };
    })
    .filter((o): o is SwiggyOrder => o !== null && o.orderTotal > 0);
}
