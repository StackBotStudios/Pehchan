import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { TransactionCard } from '../components/TransactionCard';
import { useAppContext } from '../hooks/useAppContext';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReviewTransactions'>;

export function ReviewTransactionsScreen({ navigation }: Props) {
  const {
    extractedTransactions,
    removeExtractedTransaction,
    updateExtractedTransaction,
    confirmExtractedTransactions,
  } = useAppContext();

  const handleConfirm = () => {
    confirmExtractedTransactions();
    navigation.navigate('Dashboard');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Review Transactions</Text>
      {extractedTransactions.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No extracted transactions to review.</Text>
        </View>
      ) : (
        <FlatList
          data={extractedTransactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TransactionCard
              transaction={item}
              onDelete={() => removeExtractedTransaction(item.id)}
              onChange={(update) => updateExtractedTransaction(item.id, update)}
            />
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Pressable
        style={[styles.confirmBtn, extractedTransactions.length === 0 && styles.confirmBtnDisabled]}
        onPress={handleConfirm}
        disabled={extractedTransactions.length === 0}
      >
        <Text style={styles.confirmText}>Confirm & Save</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F3F4F6',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#6B7280',
  },
  listContent: {
    paddingBottom: 90,
  },
  confirmBtn: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: '#16A34A',
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
