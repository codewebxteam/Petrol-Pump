import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import Icon from '@expo/vector-icons/Ionicons';

// Animated Liquid Component
const AnimatedLiquid = ({ color }) => {
  const heightProgress = useSharedValue(0);

  useEffect(() => {
    heightProgress.value = withSpring(65, { 
      damping: 15, 
      stiffness: 70 
    });
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      height: `${heightProgress.value}%`,
    };
  });

  return (
    <Animated.View style={[styles.liquid, { backgroundColor: color }, animatedStyle]}>
      {/* 3D Liquid Top Edge Highlight */}
      <View style={[styles.liquidTopEdge, { backgroundColor: 'rgba(255,255,255,0.45)' }]} />
    </Animated.View>
  );
};

export default function TankStockCard({ 
  tankId = 'Tank 1',
  tankName,
  fuelType,
  stock,
  petrolStock, 
  dieselStock,
  dipReading,
  onEdit
}) {
  // Determine whether this card is strictly Petrol (Tank 1) or Diesel (Tank 2)
  const isDiesel = fuelType?.toLowerCase() === 'diesel' || 
                   String(tankId).toLowerCase().includes('diesel') || 
                   String(tankName || '').toLowerCase().includes('diesel') ||
                   String(tankId).includes('2');

  const fuelName = isDiesel ? 'Diesel (HSD)' : 'Petrol (MS)';
  const tankLabel = isDiesel ? 'Tank 2' : 'Tank 1';
  const themeColor = isDiesel ? '#003C8F' : '#E65100';
  const liquidColor = isDiesel ? '#0284C7' : '#FF6F00';
  const bgTint = isDiesel ? '#F0F7FF' : '#FFF9F2';
  const borderColor = isDiesel ? '#BFDBFE' : '#FED7AA';

  // Compute live stock in Liters (Prioritize fuel-specific stock, fallback to general stock)
  let currentStock = 0;
  if (isDiesel) {
    if (dieselStock !== undefined && dieselStock !== null) {
      currentStock = parseFloat(dieselStock) || 0;
    } else if (stock !== undefined && stock !== null) {
      currentStock = parseFloat(stock) || 0;
    }
  } else {
    if (petrolStock !== undefined && petrolStock !== null) {
      currentStock = parseFloat(petrolStock) || 0;
    } else if (stock !== undefined && stock !== null) {
      currentStock = parseFloat(stock) || 0;
    }
  }

  return (
    <View style={[styles.card, { borderColor: borderColor }]}>
      {/* Top Header: Tank Identifier & Fuel Badge */}
      <View style={styles.headerRow}>
        <View style={[styles.tankBadge, { backgroundColor: themeColor }]}>
          <Icon name={isDiesel ? "water" : "flame"} size={16} color="#fff" style={{ marginRight: 5 }} />
          <Text style={styles.tankBadgeText}>{tankLabel}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.fuelTypePill, { backgroundColor: bgTint, borderColor: themeColor }]}>
            <Text style={[styles.fuelTypePillText, { color: themeColor }]}>
              {isDiesel ? '🛢️' : '⛽'} {fuelName}
            </Text>
          </View>

          {onEdit && (
            <TouchableOpacity 
              style={[styles.miniEditPill, { borderColor: themeColor, backgroundColor: bgTint }]}
              onPress={() => onEdit(isDiesel ? 'Tank-2' : 'Tank-1')}
              activeOpacity={0.7}
            >
              <Icon name="create-outline" size={13} color={themeColor} />
              <Text style={[styles.miniEditPillText, { color: themeColor }]}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Body: Cylinder + Live Liters Only (No Percentage, No Capacity, No Swatah Wapas) */}
      <View style={styles.bodyRow}>
        {/* Animated Cylinder Visual */}
        <View style={[styles.tankCylinder, { backgroundColor: bgTint, borderColor: themeColor }]}>
          <AnimatedLiquid color={liquidColor} />
          
          <View style={styles.glassReflection} />
          <View style={[styles.marker, { bottom: '25%', backgroundColor: themeColor }]} />
          <View style={[styles.marker, { bottom: '50%', backgroundColor: themeColor }]} />
          <View style={[styles.marker, { bottom: '75%', backgroundColor: themeColor }]} />
        </View>

        {/* Live Stock Display (Liters Only) */}
        <View style={styles.stockInfo}>
          <Text style={styles.stockLabel}>Available Stock</Text>
          <Text style={[styles.currentStockNumber, { color: themeColor }]}>
            {currentStock.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L
          </Text>

          {dipReading ? (
            <Text style={styles.dipReadingText}>
              📏 Dip: <Text style={{ fontWeight: '700', color: themeColor }}>{dipReading}</Text>
            </Text>
          ) : null}
          
          <View style={[styles.statusBadge, { backgroundColor: bgTint }]}>
            <View style={[styles.statusDot, { backgroundColor: '#16A34A' }]} />
            <Text style={[styles.statusText, { color: themeColor }]}>
              {tankLabel} Active
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  tankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    elevation: 1,
  },
  tankBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  fuelTypePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  fuelTypePillText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  miniEditPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 10,
    borderWidth: 1,
  },
  miniEditPillText: {
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 3
  },
  dipReadingText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 6,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  tankCylinder: {
    width: 62,
    height: 110,
    borderRadius: 31,
    borderWidth: 3,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    position: 'relative',
    marginRight: 16,
  },
  liquid: {
    width: '100%',
    position: 'absolute',
    bottom: 0,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  liquidTopEdge: {
    height: 6,
    width: '100%',
    position: 'absolute',
    top: 0,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  glassReflection: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 8,
    width: 8,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: 4,
    zIndex: 2,
  },
  marker: {
    position: 'absolute',
    right: 0,
    width: 12,
    height: 2,
    opacity: 0.35,
    zIndex: 1,
  },
  stockInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  stockLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  currentStockNumber: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11.5,
    fontWeight: 'bold',
  },
});
