import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import colors from '../constants/colors';
import styles from '../styles/verificationStyles';

const VerificationScreen = ({
  onBack,
  onContinue,
  phoneNumber = '+1 2620 0323 7631',
}) => {
  const [otp, setOtp] = useState(['', '', '', '']);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [timer, setTimer] = useState(20);

  const inputRefs = [
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
  ];

  // Countdown timer for resending code
  useEffect(() => {
    let interval = null;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timer]);

  const handleOtpChange = (text, index) => {
    // Keep only numbers and last typed character if length > 1
    const cleaned = text.replace(/[^0-9]/g, '');
    const char = cleaned.slice(-1);

    const newOtp = [...otp];
    newOtp[index] = char;
    setOtp(newOtp);

    // Auto-focus next input if character was typed
    if (char && index < 3) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (otp[index] === '' && index > 0) {
        // Move back to previous box on backspace when current is empty
        inputRefs[index - 1].current?.focus();
      }
    }
  };

  const handleResend = () => {
    if (timer === 0) {
      setTimer(20);
      // Optional: Call resend callback or reset OTP
    }
  };

  const handleContinue = () => {
    if (onContinue) {
      onContinue(otp.join(''));
    }
  };

  const formatTimer = () => {
    const minutes = Math.floor(timer / 60);
    const seconds = timer % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back button */}
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={24} color={colors.textDark} />
        </TouchableOpacity>

        {/* Title */}
        <Text style={styles.title}>Verification</Text>

        {/* Subtitle */}
        <Text style={styles.subTitle}>
          We’ve send you the verification{'\n'}code on {phoneNumber}
        </Text>

        {/* 4 OTP Input Boxes */}
        <View style={styles.otpRow}>
          {otp.map((digit, index) => {
            const isFocused = focusedIndex === index;
            return (
              <TouchableOpacity
                key={index}
                activeOpacity={1}
                style={[
                  styles.otpBox,
                  isFocused && styles.otpBoxActive,
                ]}
                onPress={() => inputRefs[index].current?.focus()}
              >
                <TextInput
                  ref={inputRefs[index]}
                  style={styles.otpInput}
                  value={digit}
                  onChangeText={(text) => handleOtpChange(text, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  onFocus={() => setFocusedIndex(index)}
                  onBlur={() => setFocusedIndex(-1)}
                  keyboardType="number-pad"
                  maxLength={1}
                  placeholder="—"
                  placeholderTextColor="#C4C4C4"
                  selectTextOnFocus
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Continue button */}
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.continueButtonText}>CONTINUE</Text>
          <View style={styles.arrowCircle}>
            <Feather name="arrow-right" size={20} color={colors.textLight} />
          </View>
        </TouchableOpacity>

        {/* Resend code */}
        <View style={styles.resendRow}>
          {timer > 0 ? (
            <Text style={styles.resendText}>
              Re-send code in <Text style={styles.timerText}>{formatTimer()}</Text>
            </Text>
          ) : (
            <TouchableOpacity onPress={handleResend} activeOpacity={0.7}>
              <Text style={styles.timerText}>Re-send code</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default VerificationScreen;
