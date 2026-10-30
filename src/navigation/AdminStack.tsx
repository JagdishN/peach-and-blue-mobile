import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AdminTabs } from './AdminTabs';
import { OrderStatusScreen } from '../screens/shared/OrderStatusScreen';
import { SettingsScreen } from '../screens/shared/SettingsScreen';
import { SetupScreen } from '../screens/admin/SetupScreen';
import { BranchesScreen } from '../screens/admin/BranchesScreen';
import { StaffManagementScreen } from '../screens/admin/StaffManagementScreen';

export type AdminStackParamList = {
  AdminTabs: undefined;
  OrderStatus: { orderId: string };
  Settings: undefined;
  // Moved out of AdminTabs (bottom tab bar) into here, reached via the
  // Overview header's Setup icon — see SetupScreen.tsx.
  Setup: undefined;
  Branches: undefined;
  Staff: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

export const AdminStack: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="AdminTabs" component={AdminTabs} />
    <Stack.Screen name="OrderStatus" component={OrderStatusScreen} />
    <Stack.Screen name="Settings" component={SettingsScreen} />
    <Stack.Screen name="Setup" component={SetupScreen} />
    <Stack.Screen name="Branches" component={BranchesScreen} />
    <Stack.Screen name="Staff" component={StaffManagementScreen} />
  </Stack.Navigator>
);
