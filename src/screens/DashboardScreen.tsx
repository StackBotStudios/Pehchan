import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart, PieChart } from 'react-native-chart-kit';

import { ChartContainer } from '../components/ChartContainer';
import { DashboardCard } from '../components/DashboardCard';
import { useAppContext } from '../hooks/useAppContext';
import { RootStackParamList } from '../types';
import {
  getCategoryBreakdown,
  getMonthlySpending,
  getTotalFoodSpending,
  getTravelSpending,
} from '../utils/analytics';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

const { width: windowWidth } = Dimensions.get('window');
/** Fixed stable width for charts to prevent layout-triggered re-render loops */
const CHART_WIDTH = windowWidth - 32;

const chartConfig = {
  backgroundGradientFrom: '#FFFFFF',
  backgroundGradientTo: '#FFFFFF',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(31, 41, 55, ${opacity})`,
  propsForDots: {
    r: '4',
    strokeWidth: '2',
    stroke: '#1D4ED8',
  },
};

export function DashboardScreen({ navigation }: Props) {
  const { user, transactions, logout } = useAppContext();

  // Memoize calculations to prevent unnecessary re-renders
  const stats = useMemo(() => ({
    foodSpending: getTotalFoodSpending(transactions),
    travelSpending: getTravelSpending(transactions),
    monthly: getMonthlySpending(transactions),
    categoryBreakdown: getCategoryBreakdown(transactions)
  }), [transactions]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Welcome, {user?.name ?? 'User'}</Text>
          <Text style={styles.subtitle}>Your local spending insights</Text>
        </View>
        <Pressable onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>

      <DashboardCard title="Total Food Spending" value={`₹ ${stats.foodSpending.toFixed(0)}`} />
      <DashboardCard title="Travel Spending" value={`₹ ${stats.travelSpending.toFixed(0)}`} />
      <DashboardCard title="Number of Transactions" value={`${transactions.length}`} />

      <Pressable style={styles.connectBtn} onPress={() => navigation.navigate('PlatformConnect')}>
        <Text style={styles.connectBtnText}>Connect Platform</Text>
      </Pressable>

      <ChartContainer title="Monthly spending">
        {stats.monthly.length === 0 ? (
          <Text style={styles.emptyText}>No transactions available for chart.</Text>
        ) : (
          <LineChart
            data={{
              labels: stats.monthly.map((item) => item.label),
              datasets: [{ data: stats.monthly.map((item) => item.value) }],
            }}
            width={CHART_WIDTH}
            height={220}
            chartConfig={chartConfig}
            bezier
            style={styles.chart}
          />
        )}
      </ChartContainer>

      <ChartContainer title="Category breakdown">
        {stats.categoryBreakdown.length === 0 ? (
          <Text style={styles.emptyText}>No category data to display.</Text>
        ) : (
          <PieChart
            data={stats.categoryBreakdown.map((item) => ({
              name: item.name,
              population: item.amount,
              color: item.color,
              legendFontColor: item.legendFontColor,
              legendFontSize: item.legendFontSize,
            }))}
            width={CHART_WIDTH}
            height={220}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="10"
          />
        )}
      </ChartContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    color: '#6B7280',
    marginTop: 2,
  },
  logoutBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  logoutText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  connectBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
    marginVertical: 10,
  },
  connectBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  chart: {
    marginLeft: -10,
  },
  emptyText: {
    paddingHorizontal: 16,
    color: '#6B7280',
  },
});
