import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Surfaces JS errors on device instead of Expo Go’s generic “Something went wrong”.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      const { message, stack } = this.state.error;
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>App crashed</Text>
          <Text style={styles.hint}>
            If you only see a loading spinner before this, the bundle may have failed to load — try{' '}
            <Text style={styles.mono}>npx expo start --tunnel</Text> and update Expo Go from the store.
          </Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.mono}>{message}</Text>
            {stack ? <Text style={styles.stack}>{stack}</Text> : null}
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: 16,
    paddingTop: 48,
    backgroundColor: '#FEF2F2',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: '#44403C',
    marginBottom: 12,
    lineHeight: 20,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#1C1917',
  },
  stack: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#57534E',
    marginTop: 12,
  },
});
