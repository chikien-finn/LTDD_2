import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import colors from '../constants/colors';
import styles from '../styles/signUpStyles';

const SignUpScreen = ({ onBack }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Feather name="arrow-left" size={24} color={colors.textDark} />
        </TouchableOpacity>

        {/* Sign up title */}
        <Text style={styles.title}>Sign up</Text>

        {/* Full name input */}
        <View style={styles.inputContainer}>
          <MaterialCommunityIcons name="account-outline" size={22} color="#747688" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor="#747688"
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        {/* Email input */}
        <View style={styles.inputContainer}>
          <MaterialCommunityIcons name="email-outline" size={22} color="#747688" style={styles.inputIcon} />
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

        {/* Password input */}
        <View style={styles.inputContainer}>
          <MaterialCommunityIcons name="lock-outline" size={22} color="#747688" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Your password"
            placeholderTextColor="#747688"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Feather name={showPassword ? 'eye' : 'eye-off'} size={20} color="#747688" />
          </TouchableOpacity>
        </View>

        {/* Confirm password input */}
        <View style={styles.inputContainer}>
          <MaterialCommunityIcons name="lock-outline" size={22} color="#747688" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor="#747688"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
          />
          <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
            <Feather name={showConfirmPassword ? 'eye' : 'eye-off'} size={20} color="#747688" />
          </TouchableOpacity>
        </View>

        {/* Sign Up button */}
        <TouchableOpacity style={styles.signUpButton} activeOpacity={0.8}>
          <Text style={styles.signUpButtonText}>SIGN UP</Text>
          <View style={styles.arrowCircle}>
            <Feather name="arrow-right" size={20} color={colors.textLight} />
          </View>
        </TouchableOpacity>

        {/* OR */}
        <Text style={styles.orText}>OR</Text>

        {/* Login with Google */}
        <TouchableOpacity style={styles.socialButton}>
          <Image source={require('../../assets/images/icon-google.png')} style={styles.socialIcon} resizeMode="contain" />
          <Text style={styles.socialText}>Login with Google</Text>
        </TouchableOpacity>

        {/* Login with Facebook */}
        <TouchableOpacity style={styles.socialButton}>
          <Image source={require('../../assets/images/icon-facebook.png')} style={styles.socialIcon} resizeMode="contain" />
          <Text style={styles.socialText}>Login with Facebook</Text>
        </TouchableOpacity>

        {/* Sign in link */}
        <View style={styles.signInRow}>
          <Text style={styles.signInText}>Already have an account? </Text>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.signInLink}>Signin</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default SignUpScreen;
