import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  Animated,
  StatusBar,
  Pressable,
} from 'react-native';
import colors from '../constants/colors';
import styles from '../styles/splashStyles';

const SplashScreen = ({ onPress }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Fade in + scale up logo
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  return (
    <Pressable style={styles.container} onPress={onPress}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Pastel blob - góc trên bên phải */}
      <View style={[styles.blob, styles.blobTopRight]} />

      {/* Pastel blob - góc trên bên trái */}
      <View style={[styles.blob, styles.blobTopLeft]} />

      {/* Pastel blob - góc dưới bên trái */}
      <View style={[styles.blob, styles.blobBottomLeft]} />

      {/* Pastel blob - góc dưới bên phải */}
      <View style={[styles.blob, styles.blobBottomRight]} />

      {/* Logo EventHub */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </Pressable>
  );
};

export default SplashScreen;
