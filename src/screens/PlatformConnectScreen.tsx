import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import { PlatformButton } from '../components/PlatformButton';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'PlatformConnect'>;

export function PlatformConnectScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect Platform</Text>
      <Text style={styles.subtitle}>Choose a platform and log in through Pehchan Browser</Text>

      <PlatformButton label="Swiggy" onPress={() => navigation.navigate('Browser', { platform: 'swiggy' })} />
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
});
