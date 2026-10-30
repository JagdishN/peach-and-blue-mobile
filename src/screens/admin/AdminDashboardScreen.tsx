import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppScreen } from '../../components/AppScreen';
import { AccountMenuButton, AccountMenuModal, useAccountMenu } from '../../components/AccountMenu';
import { PriceChip } from '../../components/PriceChip';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchBranch, Branch } from '../../api/branches';
import { fetchSummary, ReportSummary } from '../../api/reports';
import { fetchAgingReport, AgingRow } from '../../api/ledger';
import { listOrders, Order } from '../../api/orders';
import { ColorTokens, fonts, radii, spacing, typography } from '../../theme/theme';
import type { AdminStackParamList } from '../../navigation/AdminStack';

type Nav = NativeStackNavigationProp<AdminStackParamList>;

const ACTIVE_STATUSES = ['picked_up', 'washing', 'ironing', 'ready', 'out_for_delivery'];

const todayLabel = () =>
  new Date().toLocaleDateString('en-IN', { weekday: undefined, day: '2-digit', month: 'short', year: 'numeric' });

export const AdminDashboardScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { state } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = state.status === 'signedIn' ? state.user : null;
  const menu = useAccountMenu();

  const [branch, setBranch] = useState<Branch | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [needsAttention, setNeedsAttention] = useState<AgingRow[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.branchId) {
      fetchBranch(user.branchId).then(setBranch).catch(() => setBranch(null));
    }
  }, [user?.branchId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryResult, agingResult, orders] = await Promise.all([
        fetchSummary(),
        fetchAgingReport(),
        listOrders({ branchId: user?.branchId ?? undefined }),
      ]);
      setSummary(summaryResult);
      setNeedsAttention(agingResult.slice(0, 3));
      setActiveOrders(orders.filter((o) => ACTIVE_STATUSES.includes(o.internalStatus)).slice(0, 3));
    } finally {
      setLoading(false);
    }
  }, [user?.branchId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <AppScreen scroll={false} avatarInHeader>
      <View style={styles.appbar}>
        <View style={styles.appbarTopRow}>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Overview</Text>
            <Text style={styles.subtitle}>Today, {todayLabel()}</Text>
          </View>
          <View style={styles.headerIcons}>
            <Pressable
              testID="setup-button"
              accessibilityRole="button"
              accessibilityLabel="Setup"
              style={styles.setupButton}
              onPress={() => navigation.navigate('Setup')}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="cog-outline" size={22} color="#fff" />
            </Pressable>
            <AccountMenuButton menu={menu} />
          </View>
        </View>
        <View style={styles.branchChip}>
          <Text style={styles.branchChipText}>{user?.branchId ? branch?.branchName ?? '…' : 'All Branches ▾'}</Text>
        </View>
      </View>

      <AccountMenuModal menu={menu} />

      <View style={styles.body}>
        {loading || !summary ? (
          <ActivityIndicator color={colors.peachPrimary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <View style={styles.statGrid}>
              <StatCard num={summary.ordersToday} label="Orders Today" styles={styles} />
              <StatCard num={`₹${summary.revenueToday}`} label="Revenue Today" styles={styles} />
              <StatCard num={`₹${summary.outstandingDues}`} label="Outstanding Dues" styles={styles} />
              <StatCard num={summary.branchesActive} label="Branches Active" styles={styles} />
            </View>

            <Text style={styles.sectionTitle}>Needs Attention</Text>
            {needsAttention.length === 0 && activeOrders.length === 0 ? (
              <Text style={styles.empty}>Nothing needs attention right now.</Text>
            ) : (
              <>
                {needsAttention.map((row) => (
                  <View key={row.customerId} style={styles.attentionCard}>
                    <Text style={styles.attentionText}>
                      {row.locationLabel} overdue {row.daysSinceLastCharge ?? 0} days
                    </Text>
                    <PriceChip amount={row.outstandingBalance} />
                  </View>
                ))}
                {activeOrders.map((order) => (
                  <Pressable
                    key={order.id}
                    style={styles.attentionCard}
                    onPress={() => navigation.navigate('OrderStatus', { orderId: order.id })}
                  >
                    <Text style={styles.attentionText}>Order #{order.orderNumber} in progress</Text>
                    <Text style={styles.reviewChip}>Review</Text>
                  </Pressable>
                ))}
              </>
            )}
          </>
        )}
      </View>
    </AppScreen>
  );
};

const StatCard: React.FC<{ num: number | string; label: string; styles: ReturnType<typeof createStyles> }> = ({
  num,
  label,
  styles,
}) => (
  <View style={styles.statCard}>
    {/* 30sp bold in a half-width card risks clipping a large currency
        amount (e.g. "₹1,25,000") — shrink-to-fit rather than let it
        overflow the card or wrap mid-number. */}
    <Text style={styles.statNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
      {num}
    </Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    appbar: {
      backgroundColor: colors.chrome,
      padding: spacing.lg,
      paddingBottom: 14,
    },
    appbarTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    // Review finding (typography pass follow-up): at 24sp, plus Android's
    // accessibility font-scaling multiplying that further, "Overview" +
    // today's date could get wide enough to collide with the Setup/Avatar
    // icons on the right, which have no flex of their own. flex:1 here
    // means this block shrinks/wraps first instead of pushing them off.
    titleWrap: {
      flex: 1,
      marginRight: spacing.sm,
    },
    headerIcons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    setupButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(16, 24, 40, 0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontFamily: fonts.headingSemiBold,
      fontWeight: '600',
      fontSize: typography.screenHeading,
      color: colors.cream,
    },
    subtitle: {
      fontSize: typography.formLabel,
      color: '#C8A67B',
      marginTop: 2,
    },
    branchChip: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
      borderRadius: radii.pill,
      paddingVertical: 5,
      paddingHorizontal: 11,
      marginTop: spacing.sm,
    },
    branchChipText: {
      fontSize: typography.formLabel,
      fontWeight: '700',
      color: colors.cream,
    },
    body: {
      flex: 1,
      padding: 14,
    },
    statGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    statCard: {
      width: '48%',
      backgroundColor: colors.peachCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: 13,
    },
    statNum: {
      fontFamily: fonts.heading,
      fontWeight: '700',
      fontSize: typography.metric,
      color: colors.navyDeep,
    },
    statLabel: {
      fontSize: typography.formLabel,
      color: colors.muted,
      fontWeight: '600',
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: typography.sectionHeading,
      fontWeight: '600',
      color: colors.navyText,
      marginVertical: spacing.sm,
    },
    attentionCard: {
      backgroundColor: colors.peachCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: 12,
      marginBottom: spacing.sm,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
    },
    attentionText: {
      flex: 1,
      fontSize: typography.formLabel,
      fontWeight: '700',
      color: colors.navyText,
    },
    reviewChip: {
      backgroundColor: colors.peachPrimary,
      color: colors.white,
      fontWeight: '800',
      fontSize: typography.caption,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: radii.pill,
      overflow: 'hidden',
    },
    empty: {
      fontSize: typography.secondary,
      color: colors.muted,
    },
  });
