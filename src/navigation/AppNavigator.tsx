import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAppContext } from '../hooks/useAppContext';
import { BrowserScreen } from '../screens/BrowserScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { PlatformConnectScreen } from '../screens/PlatformConnectScreen';
import { PasteTransactionsScreen } from '../screens/PasteTransactionsScreen';
import { ReviewTransactionsScreen } from '../screens/ReviewTransactionsScreen';
import { SwiggyAutoLoginScreen } from '../screens/SwiggyAutoLoginScreen';
import { SwiggyAnalyticsScreen } from '../screens/SwiggyAnalyticsScreen';
import { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Separate stacks avoid react-native-screens / native-stack bugs when the same
 * navigator mounts and unmounts different screen sets (auth vs app).
 */
function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerTitleAlign: 'center' }} initialRouteName="Login">
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Login' }} />
    </Stack.Navigator>
  );
}

function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerTitleAlign: 'center' }} initialRouteName="Dashboard">
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Stack.Screen
        name="PlatformConnect"
        component={PlatformConnectScreen}
        options={{ title: 'Connect' }}
      />
      <Stack.Screen name="Browser" component={BrowserScreen} options={{ title: 'Pehchan Browser' }} />
      <Stack.Screen
        name="PasteTransactions"
        component={PasteTransactionsScreen}
        options={{ title: 'Paste orders' }}
      />
      <Stack.Screen
        name="ReviewTransactions"
        component={ReviewTransactionsScreen}
        options={{ title: 'Review Transactions' }}
      />
      <Stack.Screen
        name="SwiggyAutoLogin"
        component={SwiggyAutoLoginScreen}
        options={{ title: 'Connecting Swiggy…' }}
      />
      <Stack.Screen
        name="SwiggyAnalytics"
        component={SwiggyAnalyticsScreen}
        options={{ title: 'Swiggy Analytics' }}
      />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { user } = useAppContext();
  const isLoggedIn = Boolean(user?.isLoggedIn);

  return (
    <NavigationContainer key={isLoggedIn ? 'app' : 'auth'}>
      {isLoggedIn ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
