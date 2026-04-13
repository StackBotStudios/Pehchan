import { StyleSheet, Text, View } from 'react-native';

interface DashboardCardProps {
  title: string;
  value: string;
}

export function DashboardCard({ title, value }: DashboardCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  title: {
    color: '#6B7280',
    fontSize: 14,
  },
  value: {
    marginTop: 6,
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
  },
});
