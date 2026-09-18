import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

// Animated Liquid Component
const AnimatedLiquid = ({ percentage, color }) => {
  const heightProgress = useSharedValue(0);

  useEffect(() => {
    heightProgress.value = withSpring(percentage, { 
      damping: 15, 
      stiffness: 70 
    });
  }, [percentage]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      height: `${heightProgress.value}%`,
    };
  });

  return (
    <Animated.View style={[styles.liquid, { backgroundColor: color }, animatedStyle]}>
      {/* 3D Liquid Top Edge Highlight */}
      <View style={[styles.liquidTopEdge, { backgroundColor: 'rgba(255,255,255,0.4)' }]} />
    </Animated.View>
  );
};

export default function TankStockCard({ 
  tankId, 
  petrolStock = 0, 
  dieselStock = 0, 
  petrolCapacity = 'N/A', 
  dieselCapacity = 'N/A' 
}) {
  const petrolPercentage = petrolCapacity !== 'N/A' && petrolStock ? Math.min((petrolStock / petrolCapacity) * 100, 100) : 0;
  const dieselPercentage = dieselCapacity !== 'N/A' && dieselStock ? Math.min((dieselStock / dieselCapacity) * 100, 100) : 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.tankId}>{tankId}</Text>
      </View>
      
      <View style={styles.tanksContainer}>
        {/* Petrol Tank */}
        <View style={styles.tankWrapper}>
          <Text style={[styles.fuelTitle, { color: '#E65100' }]}>PETROL</Text>
          
          <View style={[styles.tankCylinder, { backgroundColor: '#FFF3E0', borderColor: '#FFB74D' }]}>
            <AnimatedLiquid percentage={petrolPercentage} color="#FF6F00" />
            
            <View style={styles.glassReflection} />
            <View style={[styles.marker, { bottom: '25%', backgroundColor: 'rgba(230,81,0,0.3)' }]} />
            <View style={[styles.marker, { bottom: '50%', backgroundColor: 'rgba(230,81,0,0.3)' }]} />
            <View style={[styles.marker, { bottom: '75%', backgroundColor: 'rgba(230,81,0,0.3)' }]} />
          </View>

          <View style={[styles.statsBox, { backgroundColor: '#FFF3E0' }]}>
            <Text style={[styles.currentStock, { color: '#E65100' }]}>{parseFloat(petrolStock).toFixed(1)} L</Text>
            {petrolCapacity !== 'N/A' && petrolCapacity ? (
              <Text style={[styles.capacityText, { color: '#FB8C00' }]}>/ {petrolCapacity} L</Text>
            ) : null}
          </View>
        </View>

        {/* Diesel Tank */}
        <View style={styles.tankWrapper}>
          <Text style={[styles.fuelTitle, { color: '#003C8F' }]}>DIESEL</Text>
          
          <View style={[styles.tankCylinder, { backgroundColor: '#E3F2FD', borderColor: '#64B5F6' }]}>
            <AnimatedLiquid percentage={dieselPercentage} color="#003C8F" />
            
            <View style={styles.glassReflection} />
            <View style={[styles.marker, { bottom: '25%', backgroundColor: 'rgba(0,60,143,0.3)' }]} />
            <View style={[styles.marker, { bottom: '50%', backgroundColor: 'rgba(0,60,143,0.3)' }]} />
            <View style={[styles.marker, { bottom: '75%', backgroundColor: 'rgba(0,60,143,0.3)' }]} />
          </View>

          <View style={[styles.statsBox, { backgroundColor: '#E3F2FD' }]}>
            <Text style={[styles.currentStock, { color: '#003C8F' }]}>{parseFloat(dieselStock).toFixed(1)} L</Text>
            {dieselCapacity !== 'N/A' && dieselCapacity ? (
              <Text style={[styles.capacityText, { color: '#1E88E5' }]}>/ {dieselCapacity} L</Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 16,
    elevation: 3,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
  },
  tankId: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    backgroundColor: '#003C8F',
    paddingHorizontal: 15,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2
  },
  tanksContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
  },
  tankWrapper: {
    alignItems: 'center',
    width: '45%',
  },
  fuelTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 8,
  },
  tankCylinder: {
    width: 50,
    height: 110,
    borderRadius: 25, 
    borderWidth: 3,
    justifyContent: 'flex-end', 
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 8,
  },
  liquid: {
    width: '100%',
    position: 'absolute',
    bottom: 0,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  liquidTopEdge: {
    height: 5,
    width: '100%',
    position: 'absolute',
    top: 0,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  glassReflection: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    left: 6,
    width: 8,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 4,
    zIndex: 2,
  },
  marker: {
    position: 'absolute',
    right: 0,
    width: 12,
    height: 2,
    zIndex: 1,
  },
  statsBox: {
    alignItems: 'center',
    padding: 6,
    borderRadius: 8,
    width: '100%'
  },
  currentStock: {
    fontSize: 14,
    fontWeight: '900',
  },
  capacityText: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 1
  }
});
