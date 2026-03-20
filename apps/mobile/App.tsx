import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { AuthScreen } from './src/features/auth/AuthScreen';
import { BranchListScreen } from './src/features/branches/BranchListScreen';
import { AppointmentListScreen } from './src/features/appointments/AppointmentListScreen';

export default function App() {
  return (
    <View style={styles.container}>
      <AuthScreen />
      <BranchListScreen />
      <AppointmentListScreen />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
