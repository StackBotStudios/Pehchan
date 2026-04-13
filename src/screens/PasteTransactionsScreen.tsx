import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppContext } from '../hooks/useAppContext';
import { RootStackParamList } from '../types';
import { buildTransactionsFromPastedText } from '../utils/scraping';

type Props = NativeStackScreenProps<RootStackParamList, 'PasteTransactions'>;

const PLATFORM_LABEL: Record<string, string> = {
  swiggy: 'Swiggy',
  zomato: 'Zomato',
  makemytrip: 'MakeMyTrip',
};

export function PasteTransactionsScreen({ route, navigation }: Props) {
  const { platform } = route.params;
  const [raw, setRaw] = useState('');
  const { setExtractedTransactions } = useAppContext();

  const handleParse = () => {
    const transactions = buildTransactionsFromPastedText(platform, raw);
    if (transactions.length === 0) {
      Alert.alert(
        'No transactions found',
        'Include lines with a store or restaurant name, a ₹ amount, and words like “delivered”, “order”, or “bill”. Copy from order email, SMS, or the app’s order details screen.'
      );
      return;
    }
    setExtractedTransactions(transactions);
    navigation.navigate('ReviewTransactions', { platform });
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Paste {PLATFORM_LABEL[platform] ?? platform} orders</Text>
      <Text style={styles.subtitle}>
        When the website blocks extraction, paste any text that lists what you ordered and prices (order emails and
        “order details” screens usually work).
      </Text>
      <TextInput
        value={raw}
        onChangeText={setRaw}
        placeholder="Paste here…"
        multiline
        textAlignVertical="top"
        style={styles.input}
      />
      <Pressable style={styles.button} onPress={handleParse}>
        <Text style={styles.buttonText}>Parse and review</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => navigation.goBack()}>
        <Text style={styles.secondaryText}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40, backgroundColor: '#F3F4F6' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subtitle: { color: '#4B5563', marginBottom: 16, lineHeight: 22 },
  input: {
    minHeight: 200,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
    fontSize: 15,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: '#2563EB', fontWeight: '600' },
});
