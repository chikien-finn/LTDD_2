import { StyleSheet, Dimensions } from 'react-native';
import colors from '../constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = SCREEN_WIDTH / 375;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28 * scale,
  },
  // Logo
  logoContainer: {
    alignItems: 'center',
    marginTop: 73 * scale,
    marginBottom: 20 * scale,
  },
  logo: {
    width: 162 * scale,
    height: 114 * scale,
  },
  // Title
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textDark,
    marginBottom: 20 * scale,
  },
  // Input fields
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4DFDF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16 * scale,
    backgroundColor: colors.white,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.textDark,
    padding: 0,
  },
  // Options row
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24 * scale,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
    marginRight: 8,
  },
  rememberText: {
    fontSize: 14,
    color: colors.textDark,
  },
  forgotText: {
    fontSize: 14,
    color: colors.textDark,
  },
  // Sign In button
  signInButton: {
    backgroundColor: colors.primary,
    borderRadius: 15,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20 * scale,
    position: 'relative',
  },
  signInText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textLight,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  arrowCircle: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // OR text
  orText: {
    fontSize: 16,
    color: colors.textGray,
    textAlign: 'center',
    marginBottom: 16 * scale,
  },
  // Social buttons
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E4DFDF',
    borderRadius: 15,
    paddingVertical: 14,
    marginBottom: 14 * scale,
    backgroundColor: colors.white,
  },
  socialIcon: {
    width: 26,
    height: 26,
    marginRight: 12,
  },
  socialText: {
    fontSize: 16,
    color: colors.textDark,
    fontWeight: '500',
  },
  // Sign up
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16 * scale,
    marginBottom: 30 * scale,
  },
  signUpText: {
    fontSize: 15,
    color: colors.textDark,
  },
  signUpLink: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '600',
  },
});

export default styles;
