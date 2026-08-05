import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { SwiggyLoginModal } from '../components/SwiggyLoginModal';
import { PlatformButton } from '../components/PlatformButton';
import { useAppContext } from '../hooks/useAppContext';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'PlatformConnect'>;

export function PlatformConnectScreen({ navigation }: Props) {
  const { swiggyCredentials, saveSwiggyCredentials, clearSwiggyCredentials } = useAppContext();
  const [showSwiggyModal, setShowSwiggyModal] = useState(false);

  function handleSwiggyPress() {
    if (swiggyCredentials) {
      navigation.navigate('SwiggyAutoLogin');
    } else {
      setShowSwiggyModal(true);
    }
  }

  function handleSwiggyCredentialsSubmit(mobile: string) {
    saveSwiggyCredentials({ mobile });
    setShowSwiggyModal(false);
    navigation.navigate('SwiggyAutoLogin');
  }

  function handleSwiggyLongPress() {
    if (!swiggyCredentials) return;
    Alert.alert(
      'Swiggy Connected',
      `Connected as +91 ${swiggyCredentials.mobile}\n\nDo you want to disconnect?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => clearSwiggyCredentials(),
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect Platform</Text>
      <Text style={styles.subtitle}>Choose a platform to sync your order history</Text>

      <PlatformButton
        label={swiggyCredentials ? `Swiggy ✓  Connected (+91 ${swiggyCredentials.mobile})` : 'Swiggy — Auto sync orders'}
        onPress={handleSwiggyPress}
        onLongPress={handleSwiggyLongPress}
        style={swiggyCredentials ? styles.connectedButton : styles.swiggyButton}
        labelStyle={swiggyCredentials ? styles.connectedLabel : styles.swiggyLabel}
      />

      <PlatformButton
        label="Swiggy — Browser (manual)"
        onPress={() => navigation.navigate('Browser', { platform: 'swiggy' })}
      />
      <PlatformButton
        label="Swiggy — paste order text"
        onPress={() => navigation.navigate('PasteTransactions', { platform: 'swiggy' })}
      />
      <PlatformButton label="Zomato" onPress={() => navigation.navigate('Browser', { platform: 'zomato' })} />
      <PlatformButton
        label="Zomato — paste order text"
        onPress={() => navigation.navigate('PasteTransactions', { platform: 'zomato' })}
      />
      <PlatformButton
        label="MakeMyTrip"
        onPress={() => navigation.navigate('Browser', { platform: 'makemytrip' })}
      />
      <PlatformButton
        label="MakeMyTrip — paste booking text"
        onPress={() => navigation.navigate('PasteTransactions', { platform: 'makemytrip' })}
      />

      <SwiggyLoginModal
        visible={showSwiggyModal}
        onClose={() => setShowSwiggyModal(false)}
        onSubmit={handleSwiggyCredentialsSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F3F4F6',
  },
  title: {
    fontSize: 24,
    color: '#111827',
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#6B7280',
    marginBottom: 20,
  },
  swiggyButton: {
    backgroundColor: '#FFF0E6',
    borderColor: '#FC8019',
    borderWidth: 2,
  },
  swiggyLabel: {
    color: '#FC8019',
  },
  connectedButton: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
    borderWidth: 2,
  },
  connectedLabel: {
    color: '#065F46',
  },
});
