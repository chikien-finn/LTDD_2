import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import colors from '../constants/colors';
import styles from '../styles/onboarding4Styles';

const Onboarding4Screen = ({ onNext, onSkip }) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Hình minh họa - preview Map */}
      <View style={styles.illustrationContainer}>
        <Image
          source={require('../../assets/images/onboarding4.png')}
          style={styles.illustration}
          resizeMode="contain"
        />
      </View>

      {/* Phần nội dung bên dưới với nền xanh bo góc */}
      <View style={styles.bottomSection}>
        {/* Tiêu đề */}
        <Text style={styles.title}>
          To Look Up More Events or{'\n'}Activities Nearby By Map
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

          {/* Dot indicators - dot 3 active */}
          <View style={styles.dotsContainer}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotActive]} />
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

export default Onboarding4Screen;
