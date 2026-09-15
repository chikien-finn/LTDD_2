import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import colors from '../constants/colors';
import styles from '../styles/signInStyles';

const SignInScreen = ({ onSignUp, onForgotPassword }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

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
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/images/logo-signin.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Sign in title */}
        <Text style={styles.title}>Sign in</Text>

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

        {/* Remember Me & Forgot Password */}
        <View style={styles.optionsRow}>
          <View style={styles.rememberRow}>
            <Switch
              value={rememberMe}
              onValueChange={setRememberMe}
              trackColor={{ false: '#E0E0E0', true: colors.primary }}
              thumbColor={colors.white}
              style={styles.switch}
            />
            <Text style={styles.rememberText}>Remember Me</Text>
          </View>
          <TouchableOpacity onPress={onForgotPassword}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        {/* Sign In button */}
        <TouchableOpacity style={styles.signInButton} activeOpacity={0.8}>
          <Text style={styles.signInText}>SIGN IN</Text>
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

        {/* Sign up link */}
        <View style={styles.signUpRow}>
          <Text style={styles.signUpText}>Don't have an account? </Text>
          <TouchableOpacity onPress={onSignUp}>
            <Text style={styles.signUpLink}>Sign up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default SignInScreen;