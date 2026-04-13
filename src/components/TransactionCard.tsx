import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Transaction } from '../types';

interface TransactionCardProps {
  transaction: Transaction;
  onDelete: () => void;
  onChange: (update: Partial<Transaction>) => void;
}

export function TransactionCard({ transaction, onDelete, onChange }: TransactionCardProps) {
  return (
    <View style={styles.card}>
      <TextInput
        value={transaction.merchant}
        onChangeText={(text) => onChange({ merchant: text })}
        placeholder="Merchant"
        style={styles.input}
      />
      <TextInput
        value={String(transaction.amount)}
        onChangeText={(text) => onChange({ amount: Number(text.replace(/[^\d.]/g, '')) || 0 })}
        placeholder="Amount"
        keyboardType="numeric"
        style={styles.input}
      />
      <TextInput
        value={transaction.date}
        onChangeText={(text) => onChange({ date: text })}
        placeholder="Date"
        style={styles.input}
      />
      <View style={styles.footer}>
        <Text style={styles.platform}>{transaction.platform.toUpperCase()}</Text>
        <Pressable onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  footer: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  platform: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  deleteText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
