 import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppScreen } from '../../components/AppScreen';
import { PriceChip } from '../../components/PriceChip';
import { SanitizedTextInput } from '../../components/SanitizedTextInput';
import { Tag } from '../../components/Tag';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { fetchGarments, Garment } from '../../api/garments';
import { createOrder } from '../../api/orders';
import { searchCustomers, createCustomer, markBagIssued, CustomerLookup } from '../../api/customers';
import { fetchCustomerCreditBalance } from '../../api/customerCredit';
import { ApiError } from '../../api/client';
import { ColorTokens, fonts, radii, spacing, typography } from '../../theme/theme';
import { getServiceTag, SPECIAL_CARE_TAG } from '../../theme/serviceTag';
import type { StaffStackParamList } from '../../navigation/StaffStack';

type Nav = NativeStackNavigationProp<StaffStackParamList, 'NewOrderEntry'>;

// Sourced from garments-seed-data-v2.json businessInfo.laundryMinimumKg —
// mirrors the backend's order-level 5kg minimum (src/services/orderService.ts)
// so the estimate shown here matches what the server will actually charge.
const LAUNDRY_MINIMUM_KG = 5;
const sanitizeNameInput = (value: string) => value.replace(/[^A-Za-z\s.]/g, '').slice(0, 60);
const sanitizePhoneInput = (value: string) => value.replace(/\D/g, '').slice(0, 10);
// Free text for the combined phone/flat/name search box below — unlike the
// two sanitizers above, this one isn't restricted to a single field's shape.
const sanitizeSearchInput = (value: string) => value.replace(/[^A-Za-z0-9\s./-]/g, '').slice(0, 60);

// Sentinel tab key for "show every service type" — mirrors
// GarmentCatalogueScreen.tsx's ALL_TAB, kept distinct from any real
// serviceType string.
const ALL_TAB = '__all__';

export const NewOrderEntryScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { state } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const serviceTag = useMemo(() => getServiceTag(colors), [colors]);
  // serviceType is open-ended now, not a fixed 3-value set (CLAUDE.md
  // "Admin can add new service types — RESOLVED") — a type that isn't in
  // getServiceTag's known 3 still needs a readable tag, not a crash.
  const tagFor = (type: string) => serviceTag[type] ?? { label: type, bg: colors.peachCard, color: colors.navyText };
  const user = state.status === 'signedIn' ? state.user : null;

  const [garments, setGarments] = useState<Garment[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // Range-priced items (priceMax, e.g. Designer Dress) — stepper-driven.
  const [chosenPrices, setChosenPrices] = useState<Record<string, number>>({});
  // Starting-price ("onwards") items — free-text entry, staff types the
  // actual price at pickup. Kept as text (not number) to allow normal
  // in-progress typing states.
  const [enteredPrices, setEnteredPrices] = useState<Record<string, string>>({});
  // Per-KG items — free-text weight entry.
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhoneNumber, setCustomerPhoneNumber] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CLAUDE.md "Customer creation — real gap": staff search by phone first,
  // then either pick an existing customer/location or add a new one, before
  // the garment picker unlocks — one continuous flow, not a separate screen.
  const [customerConfirmed, setCustomerConfirmed] = useState(false);
  const [phoneQuery, setPhoneQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // null = haven't searched yet; [] = searched, no matches (show new-customer form).
  const [searchResults, setSearchResults] = useState<CustomerLookup[] | null>(null);
  const [confirmingNewCustomer, setConfirmingNewCustomer] = useState(false);

  // CLAUDE.md "Laundry bag tracking" — free bag, issued once per customer;
  // surfaced here since staff is physically at the pickup handing it over.
  const [confirmedCustomerId, setConfirmedCustomerId] = useState<string | null>(null);
  const [bagIssued, setBagIssued] = useState(false);
  // Payment collection / customer advances rework, Phase 4/7 — "make
  // balances visible to Admin and authorized Staff." Read-only here;
  // staff has no refund/reversal action, only CustomerManagementScreen
  // (admin) does.
  const [creditAvailable, setCreditAvailable] = useState<number | null>(null);
  const [issuingBag, setIssuingBag] = useState(false);

  useEffect(() => {
    fetchGarments()
      .then((fetched) => {
        setGarments(fetched);
        // Range-priced items default to the low end of the range; staff
        // adjust from there.
        setChosenPrices(
          Object.fromEntries(fetched.filter((g) => g.priceMax !== null).map((g) => [g.id, Number(g.price)]))
        );
        // Starting-price items default their text entry to the floor.
        setEnteredPrices(
          Object.fromEntries(fetched.filter((g) => g.isStartingPrice).map((g) => [g.id, String(g.price)]))
        );
      })
      .catch(() => setError('Could not load the garment catalogue.'))
      .finally(() => setLoading(false));
  }, []);

  // CLAUDE.md "Garment picker restructuring — service-type as parent" —
  // serviceType is the top-level grouping, picked via the tab row below
  // (Ironing default-active since it's staff's most common case).
  // SERVICE_ORDER fixes the display order; any future serviceType not in
  // this list is appended alphabetically rather than silently dropped.
  const SERVICE_ORDER = ['ironing', 'wash_fold', 'dry_clean'];
  // CLAUDE.md "Iron-only tier reintroduced" flagged this: the catalogue grew
  // to 192 items with no way to jump straight to one during a live pickup.
  // Filters by itemName only (not category/serviceType) — that's the thing
  // staff actually knows the customer said.
  const [garmentQuery, setGarmentQuery] = useState('');
  // Ironing is staff's most common case — default the tab to it instead of
  // "All" so the most-used list is what's shown first.
  const [activeTab, setActiveTab] = useState<string>('ironing');

  // Built off the unfiltered garment list so the tab bar itself stays
  // stable while the user types a search query — same reasoning as
  // GarmentCatalogueScreen.tsx's serviceTabs.
  const serviceTabs = useMemo(() => {
    const present = new Set(garments.map((g) => g.serviceType));
    return [
      ...SERVICE_ORDER.filter((key) => present.has(key)),
      ...Array.from(present).filter((key) => !SERVICE_ORDER.includes(key)).sort(),
    ];
  }, [garments]);

  const filteredGarments = useMemo(() => {
    const query = garmentQuery.trim().toLowerCase();
    return garments.filter((g) => {
      if (activeTab !== ALL_TAB && g.serviceType !== activeTab) return false;
      if (!query) return true;
      return g.itemName.toLowerCase().includes(query);
    });
  }, [garments, garmentQuery, activeTab]);

  // Client ask: sub-group by category (Men's/Women's/Kids Wear, Household,
  // etc.) with the sub-group headers frozen while scrolling, same as the
  // service-type tabs above are frozen — mirrors GarmentCatalogueScreen.tsx's
  // categorySections. Grouped by (serviceType, category), not category
  // alone, for the same reason as there: "Laundry Services (Per KG)" is a
  // real category name reused by both wash_fold and dry_clean, so grouping
  // by category text alone would wrongly merge those two unrelated items
  // whenever the "All" tab is active.
  const categorySections = useMemo(() => {
    const groups = new Map<string, { title: string; serviceType: string; garments: Garment[] }>();
    for (const garment of filteredGarments) {
      const category = garment.category ?? 'Other';
      const key = `${garment.serviceType}::${category}`;
      if (!groups.has(key)) groups.set(key, { title: category, serviceType: garment.serviceType, garments: [] });
      groups.get(key)!.garments.push(garment);
    }
    return Array.from(groups.values()).map((group) => ({
      title: group.title,
      serviceType: group.serviceType,
      data: group.garments,
    }));
  }, [filteredGarments]);

  const adjustQuantity = (garmentId: string, delta: number) => {
    setQuantities((prev) => {
      const next = Math.max(0, (prev[garmentId] ?? 0) + delta);
      return { ...prev, [garmentId]: next };
    });
  };

  const adjustChosenPrice = (garment: Garment, delta: number) => {
    const min = Number(garment.price);
    const max = Number(garment.priceMax);
    setChosenPrices((prev) => {
      const current = prev[garment.id] ?? min;
      const next = Math.min(max, Math.max(min, current + delta));
      return { ...prev, [garment.id]: next };
    });
  };

  const unitPriceFor = (garment: Garment) => {
    if (garment.priceMax !== null || garment.isStartingPrice) {
      return chosenPrices[garment.id] ?? Number(garment.price);
    }
    return Number(garment.price);
  };

  const enteredPriceBelowFloor = (garment: Garment) => {
    const entered = parseFloat(enteredPrices[garment.id] ?? '');
    return Number.isFinite(entered) && entered < Number(garment.price);
  };

  const totalPerKgWeight = useMemo(
    () =>
      garments
        .filter((g) => g.pricingUnit === 'per_kg')
        .reduce((sum, g) => sum + (parseFloat(weights[g.id] ?? '') || 0), 0),
    [garments, weights]
  );

  const estimatedTotal = useMemo(() => {
    let pieceTotal = 0;
    let perKgRawTotal = 0;

    for (const garment of garments) {
      if (garment.pricingUnit === 'per_kg') {
        const weight = parseFloat(weights[garment.id] ?? '') || 0;
        if (weight > 0) perKgRawTotal += weight * Number(garment.price);
        continue;
      }

      const qty = quantities[garment.id] ?? 0;
      if (qty > 0) {
        const price = garment.isStartingPrice
          ? parseFloat(enteredPrices[garment.id] ?? '') || Number(garment.price)
          : unitPriceFor(garment);
        pieceTotal += qty * price;
      }
    }

    // Mirror the backend's order-level 5kg minimum so this estimate matches
    // what will actually be charged.
    const perKgFinal =
      totalPerKgWeight > 0 && totalPerKgWeight < LAUNDRY_MINIMUM_KG
        ? perKgRawTotal * (LAUNDRY_MINIMUM_KG / totalPerKgWeight)
        : perKgRawTotal;

    return pieceTotal + perKgFinal;
  }, [garments, quantities, chosenPrices, enteredPrices, weights, totalPerKgWeight]);

  const handleConfirm = async () => {
    if (!user?.branchId) {
      setError('Your account is not assigned to a branch.');
      return;
    }

    const items: { garmentId: string; quantity?: number; weightKg?: number; chosenPrice?: number }[] = [];
    let validationError: string | null = null;

    for (const garment of garments) {
      if (garment.pricingUnit === 'per_kg') {
        const weight = parseFloat(weights[garment.id] ?? '') || 0;
        if (weight > 0) items.push({ garmentId: garment.id, weightKg: weight });
        continue;
      }

      const qty = quantities[garment.id] ?? 0;
      if (qty <= 0) continue;

      if (garment.priceMax !== null) {
        items.push({ garmentId: garment.id, quantity: qty, chosenPrice: chosenPrices[garment.id] ?? Number(garment.price) });
      } else if (garment.isStartingPrice) {
        const entered = parseFloat(enteredPrices[garment.id] ?? '');
        const floor = Number(garment.price);
        if (!Number.isFinite(entered) || entered < floor) {
          validationError = `${garment.itemName} price must be at least ₹${garment.price}.`;
          break;
        }
        items.push({ garmentId: garment.id, quantity: qty, chosenPrice: entered });
      } else {
        items.push({ garmentId: garment.id, quantity: qty });
      }
    }

    if (validationError) {
      setError(validationError);
      return;
    }

    if (items.length === 0) {
      setError('Add at least one garment.');
      return;
    }

    if (!customerConfirmed || !customerName || !customerPhoneNumber || !locationLabel) {
      setError('Find or add a customer before confirming the pickup.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await createOrder({
        customerName,
        customerPhoneNumber,
        locationLabel,
        branchId: user.branchId,
        pickupDate: new Date().toISOString(),
        items,
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the order.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSearchCustomer = async () => {
    const query = phoneQuery.trim();
    if (!query) return;
    setSearching(true);
    setSearchError(null);
    setError(null);
    try {
      const results = await searchCustomers(query);
      const ranked = [...results].sort((a, b) => {
        const flatPriority = (customer: CustomerLookup) => {
          const flatDigits = customer.locationLabel.replace(/\D/g, '').toLowerCase();
          const flat = customer.locationLabel.toLowerCase();
          if (flatDigits.includes(query.toLowerCase()) || flat.includes(query.toLowerCase())) return 0;
          if (customer.phoneNumber.toLowerCase().includes(query.toLowerCase())) return 1;
          if (customer.fullName.toLowerCase().includes(query.toLowerCase())) return 2;
          return 3;
        };

        const aPriority = flatPriority(a);
        const bPriority = flatPriority(b);
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.locationLabel.localeCompare(b.locationLabel) || a.fullName.localeCompare(b.fullName);
      });
      setSearchResults(ranked);
      if (ranked.length === 0) {
        // The query could be a phone, a flat no., or a name now — only
        // carry it into the new-customer phone field when it actually
        // looks like one (exactly 10 digits); otherwise leave all three
        // fields below blank for manual entry rather than guessing wrong.
        const digitsOnly = query.replace(/\D/g, '');
        setCustomerPhoneNumber(digitsOnly.length === 10 ? digitsOnly : '');
        setCustomerName('');
        setLocationLabel('');
      }
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : 'Could not search for this customer.');
    } finally {
      setSearching(false);
    }
  };

  const selectExistingCustomer = (customer: CustomerLookup) => {
    setSearchError(null);
    setError(null);
    setCustomerName(customer.fullName);
    setCustomerPhoneNumber(customer.phoneNumber);
    setLocationLabel(customer.locationLabel);
    setConfirmedCustomerId(customer.id);
    setBagIssued(customer.bagIssued);
    setCustomerConfirmed(true);
    setCreditAvailable(null);
    fetchCustomerCreditBalance(customer.id)
      .then((balance) => setCreditAvailable(Math.round(balance.availablePaise) / 100))
      .catch(() => setCreditAvailable(null));
  };

  const handleConfirmNewCustomer = async () => {
    const trimmedName = customerName.trim();
    if (!trimmedName || !locationLabel) {
      setError('Customer name and location are required.');
      return;
    }
    if (!/^[A-Za-z][A-Za-z\s.]*$/.test(trimmedName)) {
      setError('Customer name must contain letters only; only "." and space are allowed as special characters.');
      return;
    }
    if (customerPhoneNumber.length !== 10) {
      setError('Customer phone number must contain 10 digits.');
      return;
    }

    setError(null);
    setSearchError(null);
    setConfirmingNewCustomer(true);
    try {
      const customer = await createCustomer({ fullName: trimmedName, phoneNumber: `+91${customerPhoneNumber}`, locationLabel });
      setConfirmedCustomerId(customer.id);
      setBagIssued(customer.bagIssued);
      setCustomerConfirmed(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this customer.');
    } finally {
      setConfirmingNewCustomer(false);
    }
  };

  const handleIssueBag = async () => {
    if (!confirmedCustomerId) return;
    setIssuingBag(true);
    try {
      await markBagIssued(confirmedCustomerId);
      setBagIssued(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not mark the bag as issued.');
    } finally {
      setIssuingBag(false);
    }
  };

  const resetCustomer = () => {
    setCustomerConfirmed(false);
    setSearchResults(null);
    setSearchError(null);
    setPhoneQuery('');
    setCustomerName('');
    setCustomerPhoneNumber('');
    setLocationLabel('');
    setConfirmedCustomerId(null);
    setBagIssued(false);
  };

  const renderGarmentRow = (garment: Garment, isLast: boolean) => {
    if (garment.pricingUnit === 'per_kg') {
      const weightText = weights[garment.id] ?? '';

      return (
        <View key={garment.id} style={[styles.garmentRow, isLast && styles.garmentRowLast]}>
          <View style={styles.garmentInfo}>
            <View style={styles.garmentNameRow}>
              <MaterialCommunityIcons
                name={(garment.iconKey ?? 'hanger') as any}
                size={15}
                color={colors.muted}
                style={styles.garmentIcon}
              />
              <Text style={styles.garmentName}>{garment.itemName}</Text>
              <Tag {...tagFor(garment.serviceType)} />
              {garment.requiresSpecialCare && <Tag {...SPECIAL_CARE_TAG} />}
            </View>
            <Text style={styles.garmentPrice}>₹{garment.price} / kg</Text>
          </View>
          <View style={styles.weightInputWrap}>
            <TextInput
              style={styles.weightInput}
              value={weightText}
              onChangeText={(text) => setWeights((prev) => ({ ...prev, [garment.id]: text }))}
              placeholder="0.0"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
            />
            <Text style={styles.weightUnit}>kg</Text>
          </View>
        </View>
      );
    }

    return (
      <View key={garment.id} style={[styles.garmentRow, isLast && styles.garmentRowLast]}>
        <View style={styles.garmentInfo}>
          <View style={styles.garmentNameRow}>
            <MaterialCommunityIcons
              name={(garment.iconKey ?? 'hanger') as any}
              size={15}
              color={colors.muted}
              style={styles.garmentIcon}
            />
            <Text style={styles.garmentName}>{garment.itemName}</Text>
            <Tag {...tagFor(garment.serviceType)} />
            {garment.requiresSpecialCare && <Tag {...SPECIAL_CARE_TAG} />}
          </View>
          {garment.priceMax !== null ? (
            <View style={styles.priceRangeRow}>
              <Pressable style={styles.priceStepperBtn} onPress={() => adjustChosenPrice(garment, -5)}>
                <Text style={styles.stepperBtnText}>–</Text>
              </Pressable>
              <Text style={styles.garmentPrice}>
                ₹{unitPriceFor(garment)} / piece (₹{garment.price}–₹{garment.priceMax})
              </Text>
              <Pressable style={styles.priceStepperBtn} onPress={() => adjustChosenPrice(garment, 5)}>
                <Text style={styles.stepperBtnText}>+</Text>
              </Pressable>
            </View>
          ) : garment.isStartingPrice ? (
            <View style={styles.startingPriceRow}>
              <Text style={styles.garmentPrice}>₹{garment.price} onwards</Text>
              <TextInput
                style={styles.startingPriceInput}
                value={enteredPrices[garment.id] ?? ''}
                onChangeText={(text) => setEnteredPrices((prev) => ({ ...prev, [garment.id]: text }))}
                placeholder={`${garment.price}`}
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
              />
            </View>
          ) : (
            <Text style={styles.garmentPrice}>₹{garment.price} / piece</Text>
          )}
          {garment.isStartingPrice && enteredPriceBelowFloor(garment) && (
            <Text style={styles.minimumNote}>Must be at least ₹{garment.price}</Text>
          )}
        </View>
        <View style={styles.stepper}>
          <Pressable style={styles.stepperBtn} onPress={() => adjustQuantity(garment.id, -1)}>
            <Text style={styles.stepperBtnText}>–</Text>
          </Pressable>
          <Text style={styles.stepperNum}>{quantities[garment.id] ?? 0}</Text>
          <Pressable style={styles.stepperBtn} onPress={() => adjustQuantity(garment.id, 1)}>
            <Text style={styles.stepperBtnText}>+</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <AppScreen scroll={false}>
      <View style={styles.appbar}>
        <Text style={styles.title}>New Order</Text>
        <Text style={styles.subtitle}>Enter customer and garment details</Text>
      </View>

      <View style={styles.body}>
        {!customerConfirmed ? (
          <>
            <Text style={styles.fieldLabel}>Phone, Flat No. or Name</Text>
            <View style={styles.phoneSearchRow}>
              <SanitizedTextInput
                testID="order-phone-search-input"
                style={[styles.field, styles.phoneSearchInput]}
                value={phoneQuery}
                onChangeText={setPhoneQuery}
                sanitize={sanitizeSearchInput}
                placeholder="Phone / Flat No. / Name"
                placeholderTextColor={colors.muted}
              />
              <Pressable
                testID="order-phone-search-button"
                style={[styles.searchButton, (searching || !phoneQuery) && styles.confirmButtonDisabled]}
                onPress={handleSearchCustomer}
                disabled={searching || !phoneQuery}
              >
                {searching ? <ActivityIndicator color={colors.white} /> : <Text style={styles.searchButtonText}>Find</Text>}
              </Pressable>
            </View>
            {searchError && <Text style={styles.error}>{searchError}</Text>}

            {searchResults !== null && searchResults.length > 0 && (
              <View style={styles.resultsBlock}>
                {/* A phone number belongs to exactly one customer now (CLAUDE.md
                    "Customer phone number uniqueness — RESOLVED") — at most one
                    result is ever possible; no "add another location for this
                    number" option anymore, that would just fail server-side. */}
                <Text style={styles.resultsLabel}>Existing customer at this number</Text>
                {searchResults.map((c) => (
                  <Pressable key={c.id} style={styles.resultCard} onPress={() => selectExistingCustomer(c)}>
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName}>{c.fullName}</Text>
                      <Text style={styles.resultLocation}>{c.locationLabel}</Text>
                    </View>
                    {c.billingMode === 'monthly_billing' && (
                      <Tag label="Monthly" bg={colors.warningBg} color={colors.warning} />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {searchResults !== null && searchResults.length === 0 && (
              <View style={styles.newCustomerBlock}>
                <Text style={styles.fieldLabel}>Customer Name</Text>
                <SanitizedTextInput
                  testID="new-customer-name-input"
                  style={styles.field}
                  value={customerName}
                  onChangeText={setCustomerName}
                  sanitize={sanitizeNameInput}
                  placeholder="Priya Menon"
                  placeholderTextColor={colors.muted}
                />
                <Text style={styles.fieldLabel}>Location (flat / house / shop no.)</Text>
                <TextInput
                  testID="new-customer-location-input"
                  style={styles.field}
                  value={locationLabel}
                  onChangeText={setLocationLabel}
                  placeholder="A-304"
                  placeholderTextColor={colors.muted}
                />
                <Text style={styles.fieldLabel}>Customer Phone Number</Text>
                <SanitizedTextInput
                  testID="new-customer-phone-input"
                  style={styles.field}
                  value={customerPhoneNumber}
                  onChangeText={setCustomerPhoneNumber}
                  sanitize={sanitizePhoneInput}
                  placeholder="9876543210"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                />
                <Pressable
                  testID="new-customer-confirm-button"
                  style={[styles.addButton, confirmingNewCustomer && styles.confirmButtonDisabled]}
                  onPress={handleConfirmNewCustomer}
                  disabled={confirmingNewCustomer}
                >
                  {confirmingNewCustomer ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.addButtonText}>Confirm Customer</Text>
                  )}
                </Pressable>
              </View>
            )}

            {error && <Text style={styles.error}>{error}</Text>}
          </>
        ) : (
          <>
            <View style={styles.confirmedCustomerCard}>
              <View style={styles.resultInfo}>
                <Text style={styles.resultName}>{customerName}</Text>
                <Text style={styles.resultLocation}>
                  {customerPhoneNumber} · {locationLabel}
                </Text>
                {creditAvailable !== null && creditAvailable > 0 && (
                  <Text style={styles.creditAvailableText}>₹{creditAvailable} advance available</Text>
                )}
              </View>
              <Pressable onPress={resetCustomer}>
                <Text style={styles.changeCustomerLink}>Change</Text>
              </Pressable>
            </View>

            {/* CLAUDE.md "Laundry bag tracking" — free, issued once per
                customer; staff is physically at the pickup, so this is the
                natural moment to hand it over and record it. */}
            <View style={styles.bagRow}>
              {bagIssued ? (
                <Tag label="Bag Issued" bg={colors.successBg} color={colors.success} />
              ) : (
                <Pressable style={styles.issueBagButton} onPress={handleIssueBag} disabled={issuingBag}>
                  {issuingBag ? (
                    <ActivityIndicator color={colors.peachPrimary} />
                  ) : (
                    <Text style={styles.issueBagButtonText}>Issue Laundry Bag (Free)</Text>
                  )}
                </Pressable>
              )}
            </View>

            <Text style={styles.sectionTitle}>Garments Collected</Text>

            <TextInput
              testID="garment-search-input"
              style={styles.field}
              value={garmentQuery}
              onChangeText={setGarmentQuery}
              placeholder="Search garments (e.g. Shirt, Saree)"
              placeholderTextColor={colors.muted}
            />

            {/* Sticky/frozen by construction, same as GarmentCatalogueScreen —
                this row lives in `body` above `garmentScroll` below, not
                inside it, so it never scrolls away with the list. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabRow}
              contentContainerStyle={styles.tabRowContent}
            >
              <Pressable
                style={[styles.tabChip, activeTab === ALL_TAB && styles.tabChipActive]}
                onPress={() => setActiveTab(ALL_TAB)}
              >
                <Text style={[styles.tabChipText, activeTab === ALL_TAB && styles.tabChipTextActive]}>All</Text>
                <MaterialCommunityIcons
                  name={activeTab === ALL_TAB ? 'chevron-down' : 'chevron-right'}
                  size={14}
                  color={activeTab === ALL_TAB ? colors.white : colors.muted}
                  style={styles.tabChipIcon}
                />
              </Pressable>
              {serviceTabs.map((type) => (
                <Pressable
                  key={type}
                  style={[styles.tabChip, activeTab === type && styles.tabChipActive]}
                  onPress={() => setActiveTab(type)}
                >
                  <Text style={[styles.tabChipText, activeTab === type && styles.tabChipTextActive]}>
                    {serviceTag[type]?.label ?? type}
                  </Text>
                  <MaterialCommunityIcons
                    name={activeTab === type ? 'chevron-down' : 'chevron-right'}
                    size={14}
                    color={activeTab === type ? colors.white : colors.muted}
                    style={styles.tabChipIcon}
                  />
                </Pressable>
              ))}
            </ScrollView>

            {loading ? (
              <ActivityIndicator color={colors.peachPrimary} style={{ marginTop: spacing.lg }} />
            ) : categorySections.length === 0 ? (
              garmentQuery.trim() !== '' && (
                <Text style={styles.noResultsText}>No garments match "{garmentQuery.trim()}".</Text>
              )
            ) : (
              // Client ask: category sub-group headers (Men's/Women's/Kids
              // Wear, Household, etc.) frozen while scrolling — mirrors
              // GarmentCatalogueScreen.tsx's SectionList.
              <SectionList
                style={styles.garmentScroll}
                showsVerticalScrollIndicator={false}
                sections={categorySections}
                keyExtractor={(garment) => garment.id}
                stickySectionHeadersEnabled
                renderSectionHeader={({ section }) => (
                  <Text style={styles.categoryHeader}>{section.title}</Text>
                )}
                renderItem={({ item: garment, index, section }) =>
                  renderGarmentRow(garment, index === section.data.length - 1)
                }
              />
            )}

            {totalPerKgWeight > 0 && totalPerKgWeight < LAUNDRY_MINIMUM_KG && (
              <Text style={styles.minimumBanner}>
                Per-KG minimum is {LAUNDRY_MINIMUM_KG}kg per order — {totalPerKgWeight.toFixed(1)}kg entered, minimum
                charge will apply.
              </Text>
            )}

            <View style={styles.totalBar}>
              <Text style={styles.totalLabel}>ESTIMATED TOTAL</Text>
              <PriceChip amount={Math.round(estimatedTotal * 100) / 100} />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.confirmButton, submitting && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.confirmButtonText}>Confirm Pickup</Text>}
            </Pressable>
          </>
        )}
      </View>
    </AppScreen>
  );
};

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    appbar: {
      backgroundColor: colors.chrome,
      padding: spacing.lg,
      paddingBottom: 14,
    },
    title: {
      fontFamily: fonts.headingSemiBold,
      fontWeight: '600',
      fontSize: typography.screenHeading,
      color: colors.cream,
    },
    subtitle: {
      fontSize: typography.secondary,
      color: '#C8A67B',
      marginTop: 2,
    },
    phoneSearchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    phoneSearchInput: {
      flex: 1,
    },
    searchButton: {
      backgroundColor: colors.peachPrimary,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    searchButtonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: typography.button,
    },
    resultsBlock: {
      marginBottom: spacing.sm,
    },
    resultsLabel: {
      fontSize: typography.caption,
      fontWeight: '700',
      color: colors.muted,
      textTransform: 'uppercase',
      marginBottom: spacing.xs,
    },
    resultCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.peachCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.sm,
      marginBottom: spacing.xs,
    },
    resultInfo: {
      flexShrink: 1,
    },
    resultName: {
      fontSize: typography.cardHeading,
      fontWeight: '700',
      color: colors.navyText,
    },
    resultLocation: {
      fontSize: typography.secondary,
      color: colors.muted,
      marginTop: 2,
    },
    creditAvailableText: {
      fontSize: typography.secondary,
      fontWeight: '700',
      color: colors.success,
      marginTop: 2,
    },
    newCustomerBlock: {
      marginBottom: spacing.sm,
    },
    addButton: {
      backgroundColor: colors.peachPrimary,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    addButtonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: typography.button,
    },
    confirmedCustomerCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.peachCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    changeCustomerLink: {
      color: colors.peachPrimary,
      fontWeight: '700',
      fontSize: typography.secondary,
    },
    bagRow: {
      marginBottom: spacing.sm,
    },
    issueBagButton: {
      alignSelf: 'flex-start',
      borderWidth: 1.5,
      borderColor: colors.peachPrimary,
      borderRadius: radii.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    issueBagButtonText: {
      color: colors.peachPrimary,
      fontWeight: '700',
      fontSize: typography.button,
    },
    body: {
      flex: 1,
      padding: 14,
      // See AppScreen.tsx's `body` style comment — react-native-web's
      // min-height:auto floor, needed at every nested flex level for the
      // garment ScrollView below to actually clip+scroll on web (same fix
      // as GarmentCatalogueScreen.tsx, proactively applied here too since
      // this picker can show the same up-to-192-item list).
      minHeight: 0,
    },
    fieldLabel: {
      fontSize: typography.formLabel,
      fontWeight: '700',
      color: colors.navyText,
      marginBottom: spacing.xs,
    },
    field: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      fontSize: typography.formValue,
      color: colors.navyText,
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      fontSize: typography.sectionHeading,
      fontWeight: '600',
      color: colors.navyText,
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    tabRow: {
      flexGrow: 0,
      marginBottom: spacing.sm,
    },
    tabRowContent: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingRight: spacing.xs,
    },
    tabChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.pill,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    tabChipActive: {
      backgroundColor: colors.peachPrimary,
      borderColor: colors.peachPrimary,
    },
    tabChipText: {
      fontSize: typography.caption,
      fontWeight: '700',
      color: colors.navyText,
    },
    tabChipTextActive: {
      color: colors.white,
    },
    tabChipIcon: {
      marginLeft: 2,
    },
    garmentScroll: {
      flex: 1,
      minHeight: 0,
    },
    noResultsText: {
      fontSize: typography.body,
      color: colors.muted,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
    // Opaque background is required, not cosmetic — this header is sticky
    // (stickySectionHeadersEnabled) and sits on top of scrolling rows
    // beneath it, same as GarmentCatalogueScreen.tsx's sectionHeader.
    categoryHeader: {
      fontSize: typography.caption,
      fontWeight: '800',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      backgroundColor: colors.peachBg,
      paddingVertical: spacing.xs,
    },
    // Each row is now its own card (SectionList gives one row per item, not
    // one shared container per category) — same per-item card look as
    // GarmentCatalogueScreen.tsx's `card`, rather than the old dashed
    // separator-inside-one-big-card look.
    garmentRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.peachCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      paddingVertical: 9,
      paddingHorizontal: 13,
      marginBottom: spacing.sm,
    },
    garmentRowLast: {
      marginBottom: spacing.md,
    },
    garmentInfo: {
      flexShrink: 1,
      paddingRight: spacing.sm,
    },
    // flexWrap + garmentName's flexShrink are required, not cosmetic — on a
    // narrow screen, a long item name + its service tag would otherwise
    // overflow past garmentInfo's right edge and sit on top of the
    // quantity stepper instead of wrapping to a second line (same bug
    // fixed earlier in GarmentCatalogueScreen.tsx's nameRow, never applied
    // here).
    garmentNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    garmentIcon: {
      marginRight: spacing.xs,
    },
    garmentName: {
      fontSize: typography.cardHeading,
      fontWeight: '600',
      color: colors.navyText,
      flexShrink: 1,
    },
    garmentPrice: {
      fontSize: typography.secondary,
      color: colors.muted,
      marginTop: 3,
    },
    priceRangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: 2,
    },
    priceStepperBtn: {
      width: 18,
      height: 18,
      borderRadius: 5,
      backgroundColor: colors.peachBg,
      borderWidth: 1,
      borderColor: colors.peachPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    startingPriceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: 2,
    },
    startingPriceInput: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.peachPrimary,
      borderRadius: 6,
      paddingVertical: 3,
      paddingHorizontal: spacing.xs,
      fontSize: typography.secondary,
      color: colors.navyText,
      minWidth: 60,
    },
    weightInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    weightInput: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.peachPrimary,
      borderRadius: 6,
      paddingVertical: 5,
      paddingHorizontal: spacing.sm,
      fontSize: typography.secondary,
      color: colors.navyText,
      minWidth: 62,
      textAlign: 'right',
    },
    weightUnit: {
      fontSize: typography.secondary,
      color: colors.muted,
      fontWeight: '600',
    },
    minimumNote: {
      fontSize: typography.secondary,
      color: colors.danger,
      marginTop: 3,
    },
    minimumBanner: {
      fontSize: typography.secondary,
      color: colors.warning,
      backgroundColor: colors.warningBg,
      borderRadius: radii.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      marginTop: spacing.sm,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    stepperBtn: {
      width: 24,
      height: 24,
      borderRadius: 6,
      backgroundColor: colors.peachBg,
      borderWidth: 1,
      borderColor: colors.peachPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperBtnText: {
      color: colors.navyDeep,
      fontWeight: '800',
      fontSize: 14,
    },
    stepperNum: {
      fontSize: typography.formValue,
      fontWeight: '700',
      color: colors.navyText,
      minWidth: 20,
      textAlign: 'center',
    },
    totalBar: {
      backgroundColor: colors.chrome,
      borderRadius: radii.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    totalLabel: {
      fontSize: typography.caption,
      color: '#C8A67B',
      fontWeight: '600',
    },
    error: {
      color: colors.danger,
      fontSize: typography.secondary,
      marginTop: spacing.sm,
    },
    confirmButton: {
      backgroundColor: colors.peachPrimary,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    confirmButtonDisabled: {
      opacity: 0.7,
    },
    confirmButtonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: typography.button,
    },
  });
