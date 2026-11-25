import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GARMENT_ICONS } from '../theme/garmentIcons';
import { resolveGarmentIcon } from '../theme/resolveGarmentIcon';

interface GarmentIconProps {
  itemName: string;
  iconKey?: string | null;
  size: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}

export const GarmentIcon = React.memo(({ itemName, iconKey, size, color, style }: GarmentIconProps) => {
  const icon = resolveGarmentIcon(itemName, iconKey);
  return (
    <View style={style}>
      {icon.set === 'garment' ? (
        <SvgXml xml={GARMENT_ICONS[icon.name]} width={size} height={size} color={color} />
      ) : (
        <MaterialCommunityIcons name={icon.name} size={size} color={color} />
      )}
    </View>
  );
});
