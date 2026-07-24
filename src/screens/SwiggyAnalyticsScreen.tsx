import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BarChart, PieChart } from 'react-native-chart-kit';

import { useAppContext } from '../hooks/useAppContext';
import { RootStackParamList, SwiggyOrder } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'SwiggyAnalytics'>;

const { width: W } = Dimensions.get('window');
const CHART_W = W - 32;

const CHART_CONFIG = {
  backgroundGradientFrom: '#FFFFFF',
  backgroundGradientTo: '#FFFFFF',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(252, 128, 25, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(55, 65, 81, ${opacity})`,
  propsForDots: { r: '4', strokeWidth: '2', stroke: '#FC8019' },
};

const PIE_COLORS = [
  '#FC8019', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6',
  '#EC4899', '#EF4444', '#14B8A6', '#F97316', '#6366F1',
];

// ─── Analytics helpers ────────────────────────────────────────────────────────

function computeAnalytics(orders: SwiggyOrder[]) {
  if (orders.length === 0) return null;

  const totalSpend = orders.reduce((s, o) => s + o.orderTotal, 0);
  const avgOrder = totalSpend / orders.length;

  // Restaurant frequency & spend
  const restaurantMap: Record<string, { count: number; spend: number }> = {};
  for (const o of orders) {
    const r = restaurantMap[o.restaurantName] ?? { count: 0, spend: 0 };
    r.count += 1;
    r.spend += o.orderTotal;
    restaurantMap[o.restaurantName] = r;
  }
  const restaurantList = Object.entries(restaurantMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count);

  const topRestaurants = restaurantList.slice(0, 10);

  // Item frequency
  const itemMap: Record<string, number> = {};
  for (const o of orders) {
    for (const item of o.items) {
      itemMap[item.name] = (itemMap[item.name] ?? 0) + item.quantity;
    }
  }
  const topItems = Object.entries(itemMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Monthly spend (last 12 months)
  const monthMap: Record<string, number> = {};
  for (const o of orders) {
    if (!o.orderDate) continue;
    const key = o.orderDate.slice(0, 7); // "YYYY-MM"
    monthMap[key] = (monthMap[key] ?? 0) + o.orderTotal;
  }
  const monthlyData = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([key, value]) => ({
      label: key.slice(5), // "MM"
      value,
    }));

  // Payment method breakdown
  const payMap: Record<string, number> = {};
  for (const o of orders) {
    const m = o.paymentMethod || 'Unknown';
    payMap[m] = (payMap[m] ?? 0) + 1;
  }
  const paymentMethods = Object.entries(payMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Cuisine breakdown
  const cuisineMap: Record<string, number> = {};
  for (const o of orders) {
    if (!o.restaurantCuisine) continue;
    // Swiggy sometimes sends comma-separated cuisines
    const parts = o.restaurantCuisine.split(',').map((c) => c.trim()).filter(Boolean);
    for (const c of parts) {
      cuisineMap[c] = (cuisineMap[c] ?? 0) + 1;
    }
  }
  const topCuisines = Object.entries(cuisineMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Day-of-week distribution
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayCount = [0, 0, 0, 0, 0, 0, 0];
  for (const o of orders) {
    if (!o.orderDate) continue;
    const d = new Date(o.orderDate).getDay();
    dayCount[d] += 1;
  }

  // Biggest single order
  const biggestOrder = [...orders].sort((a, b) => b.orderTotal - a.orderTotal)[0];

  // Most recent order
  const latestOrder = [...orders]
    .filter((o) => o.orderDate)
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate))[0];

  // Charges aggregates (only from orders that have detail data)
  const ordersWithCharges = orders.filter((o) => o.charges);
  const chargesSummary = ordersWithCharges.length > 0 ? {
    totalDeliveryFee: ordersWithCharges.reduce((s, o) => s + (o.charges?.deliveryFee ?? 0), 0),
    totalDiscount: ordersWithCharges.reduce((s, o) => s + (o.charges?.discount ?? 0) + (o.charges?.couponDiscount ?? 0) + (o.charges?.extraDiscount ?? 0), 0),
    totalPackaging: ordersWithCharges.reduce((s, o) => s + (o.charges?.packagingFee ?? 0), 0),
    totalPlatformFee: ordersWithCharges.reduce((s, o) => s + (o.charges?.platformFee ?? 0), 0),
    totalTaxes: ordersWithCharges.reduce((s, o) => s + (o.charges?.taxes ?? 0), 0),
    count: ordersWithCharges.length,
  } : null;

  return {
    totalSpend,
    avgOrder,
    topRestaurants,
    topItems,
    monthlyData,
    paymentMethods,
    topCuisines,
    dayLabels,
    dayCount,
    biggestOrder,
    latestOrder,
    chargesSummary,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function ChargeRow({ label, value, color, bold, prefix }: { label: string; value: number; color: string; bold?: boolean; prefix?: string }) {
  return (
    <View style={styles.chargeRow}>
      <Text style={[styles.chargeLabel, bold && { fontWeight: '700', color: '#111827' }]}>{label}</Text>
      <Text style={[styles.chargeValue, { color }]}>
        {prefix ?? ''}{prefix ? '' : ''}₹{value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      </Text>
    </View>
  );
}

function RankRow({
  rank,
  name,
  right,
  sub,
}: {
  rank: number;
  name: string;
  right: string;
  sub?: string;
}) {
  return (
    <View style={styles.rankRow}>
      <View style={styles.rankBadge}>
        <Text style={styles.rankBadgeText}>{rank}</Text>
      </View>
      <View style={styles.rankInfo}>
        <Text style={styles.rankName} numberOfLines={1}>{name}</Text>
        {sub ? <Text style={styles.rankSub}>{sub}</Text> : null}
      </View>
      <Text style={styles.rankRight}>{right}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function SwiggyAnalyticsScreen({ navigation }: Props) {
  const { swiggyOrders, swiggyCredentials } = useAppContext();

  const analytics = useMemo(() => computeAnalytics(swiggyOrders), [swiggyOrders]);

  if (swiggyOrders.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🍔</Text>
        <Text style={styles.emptyTitle}>No Swiggy data yet</Text>
        <Text style={styles.emptySubtitle}>
          Go back and sync your Swiggy account to see analytics.
        </Text>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!analytics) return null;

  const {
    totalSpend,
    avgOrder,
    topRestaurants,
    topItems,
    monthlyData,
    paymentMethods,
    topCuisines,
    dayLabels,
    dayCount,
    biggestOrder,
    latestOrder,
    chargesSummary,
  } = analytics;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.swiggyBadge}>
          <Text style={styles.swiggyBadgeText}>Swiggy Analytics</Text>
        </View>
        {swiggyCredentials && (
          <Text style={styles.headerMobile}>+91 {swiggyCredentials.mobile}</Text>
        )}
        <Pressable
          style={styles.refreshBtn}
          onPress={() => navigation.replace('SwiggyAutoLogin')}
        >
          <Text style={styles.refreshBtnText}>Refresh data</Text>
        </Pressable>
      </View>

      {/* Top stats */}
      <View style={styles.statsRow}>
        <StatCard
          label="Total Spend"
          value={`₹${totalSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
        />
        <StatCard
          label="Total Orders"
          value={`${swiggyOrders.length}`}
        />
      </View>
      <View style={styles.statsRow}>
        <StatCard
          label="Avg Order"
          value={`₹${avgOrder.toFixed(0)}`}
        />
        <StatCard
          label="Restaurants"
          value={`${topRestaurants.length}`}
          sub="unique"
        />
      </View>

      {biggestOrder && (
        <View style={styles.highlightCard}>
          <Text style={styles.highlightLabel}>Biggest Order</Text>
          <Text style={styles.highlightMain}>{biggestOrder.restaurantName}</Text>
          <Text style={styles.highlightAmount}>
            ₹{biggestOrder.orderTotal.toLocaleString('en-IN')}
            {biggestOrder.orderDate ? `  •  ${biggestOrder.orderDate}` : ''}
          </Text>
        </View>
      )}

      {latestOrder && (
        <View style={[styles.highlightCard, { backgroundColor: '#F0FDF4' }]}>
          <Text style={styles.highlightLabel}>Last Order</Text>
          <Text style={styles.highlightMain}>{latestOrder.restaurantName}</Text>
          <Text style={styles.highlightAmount}>
            ₹{latestOrder.orderTotal.toLocaleString('en-IN')}
            {latestOrder.orderDate ? `  •  ${latestOrder.orderDate}` : ''}
          </Text>
        </View>
      )}

      {/* Spend breakdown */}
      {chargesSummary && (
        <>
          <SectionHeader title={`Spend Breakdown (${chargesSummary.count} orders)`} />
          <View style={styles.listCard}>
            <ChargeRow label="Food Total" value={totalSpend} color="#111827" bold />
            <ChargeRow label="Total Delivery Fees Paid" value={chargesSummary.totalDeliveryFee} color="#EF4444" />
            <ChargeRow label="Packaging Fees" value={chargesSummary.totalPackaging} color="#F59E0B" />
            <ChargeRow label="Platform Fees + GST" value={chargesSummary.totalPlatformFee} color="#F59E0B" />
            <ChargeRow label="Taxes" value={chargesSummary.totalTaxes} color="#6B7280" />
            <ChargeRow label="Total Discounts Saved" value={chargesSummary.totalDiscount} color="#10B981" prefix="-" />
          </View>
        </>
      )}

      {/* Monthly spend bar chart */}
      {monthlyData.length > 0 && (
        <>
          <SectionHeader title="Monthly Spend" />
          <View style={styles.chartCard}>
            <BarChart
              data={{
                labels: monthlyData.map((m) => m.label),
                datasets: [{ data: monthlyData.map((m) => m.value) }],
              }}
              width={CHART_W - 32}
              height={200}
              chartConfig={CHART_CONFIG}
              yAxisLabel="₹"
              yAxisSuffix=""
              style={styles.chart}
              showValuesOnTopOfBars
              fromZero
            />
          </View>
        </>
      )}

      {/* Day of week */}
      <SectionHeader title="Orders by Day of Week" />
      <View style={styles.chartCard}>
        <BarChart
          data={{
            labels: dayLabels,
            datasets: [{ data: dayCount }],
          }}
          width={CHART_W - 32}
          height={180}
          chartConfig={CHART_CONFIG}
          yAxisLabel=""
          yAxisSuffix=""
          style={styles.chart}
          fromZero
        />
      </View>

      {/* Top restaurants */}
      <SectionHeader title="Top Restaurants" />
      <View style={styles.listCard}>
        {topRestaurants.map((r, i) => (
          <RankRow
            key={r.name}
            rank={i + 1}
            name={r.name}
            right={`₹${r.spend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            sub={`${r.count} order${r.count > 1 ? 's' : ''}`}
          />
        ))}
      </View>

      {/* Most ordered items */}
      {topItems.length > 0 && (
        <>
          <SectionHeader title="Most Ordered Items" />
          <View style={styles.listCard}>
            {topItems.map((item, i) => (
              <RankRow
                key={item.name}
                rank={i + 1}
                name={item.name}
                right={`×${item.count}`}
              />
            ))}
          </View>
        </>
      )}

      {/* Cuisine pie chart */}
      {topCuisines.length > 0 && (
        <>
          <SectionHeader title="Cuisine Breakdown" />
          <View style={styles.chartCard}>
            <PieChart
              data={topCuisines.map((c, i) => ({
                name: c.name,
                population: c.count,
                color: PIE_COLORS[i % PIE_COLORS.length]!,
                legendFontColor: '#374151',
                legendFontSize: 12,
              }))}
              width={CHART_W - 32}
              height={200}
              chartConfig={CHART_CONFIG}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="8"
            />
          </View>
        </>
      )}

      {/* Payment methods */}
      {paymentMethods.length > 0 && (
        <>
          <SectionHeader title="Payment Methods" />
          <View style={styles.listCard}>
            {paymentMethods.map((p, i) => (
              <RankRow
                key={p.name}
                rank={i + 1}
                name={p.name}
                right={`${p.count} order${p.count > 1 ? 's' : ''}`}
              />
            ))}
          </View>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 16 },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8 },
  emptySubtitle: { color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  backBtn: { backgroundColor: '#FC8019', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  headerCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  swiggyBadge: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  swiggyBadgeText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  headerMobile: { color: '#92400E', fontWeight: '600', fontSize: 13, flex: 1 },
  refreshBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FC8019',
  },
  refreshBtnText: { color: '#FC8019', fontWeight: '600', fontSize: 13 },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: '#FC8019' },
  statLabel: { color: '#6B7280', fontSize: 12, marginTop: 4, textAlign: 'center' },
  statSub: { color: '#9CA3AF', fontSize: 11 },

  highlightCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FC8019',
  },
  highlightLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  highlightMain: { fontSize: 16, fontWeight: '700', color: '#111827' },
  highlightAmount: { color: '#6B7280', fontSize: 13, marginTop: 2 },

  sectionHeader: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
    marginBottom: 10,
  },

  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  chart: { marginLeft: -8 },

  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankBadgeText: { color: '#FC8019', fontWeight: '700', fontSize: 13 },
  rankInfo: { flex: 1 },
  rankName: { color: '#111827', fontWeight: '600', fontSize: 14 },
  rankSub: { color: '#9CA3AF', fontSize: 12, marginTop: 1 },
  rankRight: { color: '#FC8019', fontWeight: '700', fontSize: 14 },

  chargeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  chargeLabel: { color: '#6B7280', fontSize: 14, flex: 1 },
  chargeValue: { fontSize: 14, fontWeight: '600' },
});
