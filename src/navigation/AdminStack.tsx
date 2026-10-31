import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AdminTabs } from './AdminTabs';
import { OrderStatusScreen } from '../screens/shared/OrderStatusScreen';
import { SettingsScreen } from '../screens/shared/SettingsScreen';
import { SetupScreen } from '../screens/admin/SetupScreen';
import { BranchesScreen } from '../screens/admin/BranchesScreen';
import { StaffManagementScreen } from '../screens/admin/StaffManagementScreen';
import { CustomerOutstandingScreen } from '../screens/admin/CustomerOutstandingScreen';
import { VendorInvoiceRegisterScreen } from '../screens/admin/VendorInvoiceRegisterScreen';
import { PaymentReconciliationScreen } from '../screens/admin/PaymentReconciliationScreen';

export type AdminStackParamList = {
  AdminTabs: undefined;
  OrderStatus: { orderId: string };
  Settings: undefined;
  // Moved out of AdminTabs (bottom tab bar) into here, reached via the
  // Overview header's Setup icon — see SetupScreen.tsx.
  Setup: undefined;
  Branches: undefined;
  Staff: undefined;
  // Outstanding-dues rework — reached from the Ledger tab's "Outstanding
  // Payments" segment, not a new bottom-nav item.
  CustomerOutstanding: { customerId: string };
  // Third-party vendor invoice management — reached via Setup, not a new
  // bottom-nav item (spec section 8).
  VendorInvoices: undefined;
  // Payment Reconciliation investigation views — reached via the Ledger
  // tab's "Reconciliation" segment, not a new bottom-nav item.
  PaymentReconciliation: undefined;
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
    <Stack.Screen name="CustomerOutstanding" component={CustomerOutstandingScreen} />
    <Stack.Screen name="VendorInvoices" component={VendorInvoiceRegisterScreen} />
    <Stack.Screen name="PaymentReconciliation" component={PaymentReconciliationScreen} />
  </Stack.Navigator>
);
