import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { GarmentCatalogueScreen } from '../screens/admin/GarmentCatalogueScreen';
import { LedgerAgingScreen } from '../screens/admin/LedgerAgingScreen';
import { CustomerManagementScreen } from '../screens/admin/CustomerManagementScreen';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

export type AdminTabParamList = {
  Orders: undefined;
  Catalogue: undefined;
  Customers: undefined;
  Ledger: undefined;
};

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Orders: 'receipt-outline',
  Catalogue: 'shirt-outline',
  Customers: 'people-outline',
  Ledger: 'wallet-outline',
};

const Tab = createBottomTabNavigator<AdminTabParamList>();

// Branches and Staff moved out of the bottom tab bar into the Setup screen
// (reachable from the Overview header's Setup icon, see AdminStack.tsx) —
// down to 4 icon-only tabs per the nav-simplification task. Both screens are
// unchanged otherwise; only how they're reached changed.
export const AdminTabs: React.FC = () => {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
       screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarIcon: ({ color }) => {
          const iconName = ICONS[route.name];
          return <Ionicons name={iconName} size={26} color={color} />;
        },
        tabBarAccessibilityLabel: route.name,
        // Icons-only now (tabBarShowLabel: false below) — gives Maestro's
        // screenshot flow (.maestro/admin-flow.yaml) a stable selector now
        // that there's no visible label text to tap on.
        tabBarButtonTestID: `tab-${route.name.toLowerCase()}`,
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: '#8FA0BE',
        tabBarActiveBackgroundColor: colors.peachPrimary,
        tabBarStyle: { backgroundColor: colors.chrome, borderTopWidth: 0 },
      })}
    >
      <Tab.Screen name="Orders" component={AdminDashboardScreen} />
      <Tab.Screen name="Catalogue" component={GarmentCatalogueScreen} />
      <Tab.Screen name="Customers" component={CustomerManagementScreen} />
      <Tab.Screen name="Ledger" component={LedgerAgingScreen} />
    </Tab.Navigator>
  );
};
