import React, { useState } from 'react';
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
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import colors from '../constants/colors';
import styles from '../styles/resetPasswordStyles';

const ResetPasswordScreen = ({ onBack, onSend }) => {
  const [email, setEmail] = useState('');

  const handleSend = () => {
    if (onSend) {
      onSend(email);
    }
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
        <Text style={styles.title}>Resset Password</Text>

        {/* Subtitle */}
        <Text style={styles.subTitle}>
          Please enter your email address to{'\n'}request a password reset
        </Text>

        {/* Email input */}
        <View style={styles.inputContainer}>
          <MaterialCommunityIcons
            name="email-outline"
            size={22}
            color="#747688"
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="abc@email.com"
            placeholderTextColor="#747688"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Send button */}
        <TouchableOpacity
          style={styles.sendButton}
          onPress={handleSend}
          activeOpacity={0.8}
        >
          <Text style={styles.sendButtonText}>SEND</Text>
          <View style={styles.arrowCircle}>
            <Feather name="arrow-right" size={20} color={colors.textLight} />
          </View>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default ResetPasswordScreen;
