import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import colors from '../constants/colors';
import styles from '../styles/onboarding2Styles';

const Onboarding2Screen = ({ onNext, onSkip }) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Hình minh họa - preview app */}
      <View style={styles.illustrationContainer}>
        <Image
          source={require('../../assets/images/onboarding2.png')}
          style={styles.illustration}
          resizeMode="contain"
        />
      </View>

      {/* Phần nội dung bên dưới với nền xanh bo góc */}
      <View style={styles.bottomSection}>
        {/* Tiêu đề */}
        <Text style={styles.title}>
          Explore Upcoming and{'\n'}Nearby Events
        </Text>

        {/* Mô tả */}
        <Text style={styles.description}>
          In publishing and graphic design, Lorem is a placeholder text commonly
        </Text>

        {/* Navigation row: Skip - Dots - Next */}
        <View style={styles.navigationRow}>
          {/* Skip */}
          <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          {/* Dot indicators */}
          <View style={styles.dotsContainer}>
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>

          {/* Next */}
          <TouchableOpacity style={styles.nextButton} onPress={onNext}>
            <Text style={styles.nextText}>Next</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default Onboarding2Screen;
