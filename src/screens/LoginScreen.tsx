import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppContext } from '../hooks/useAppContext';

export function LoginScreen() {
  const [name, setName] = useState('');
  const { login } = useAppContext();

  const handleLogin = () => {
    if (!name.trim()) {
      return;
    }
    login(name.trim());
    // Do not navigate here: while `user` is still falsey, only `Login` exists on the stack.
    // `replace('Dashboard')` runs before re-render and crashes because `Dashboard` is not registered yet.
    // After `login()`, AppNavigator re-renders and shows `Dashboard` as the first app screen.
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pehchan</Text>
      <Text style={styles.subtitle}>Local POC login (no backend)</Text>
      <TextInput
        placeholder="Enter your name"
        value={name}
        onChangeText={setName}
        style={styles.input}
        autoCapitalize="words"
      />
      <Pressable style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F3F4F6',
  },
  title: {
    fontSize: 34,
    color: '#111827',
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    color: '#6B7280',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderColor: '#D1D5DB',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
  },
  buttonText: {
    textAlign: 'center',
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
