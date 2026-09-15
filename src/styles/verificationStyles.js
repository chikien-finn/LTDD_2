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
  // Back button
  backButton: {
    marginTop: 44 * scale,
    marginBottom: 20 * scale,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  // Title
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textDark,
    marginBottom: 12 * scale,
  },
  // Subtitle
  subTitle: {
    fontSize: 15,
    color: colors.textGray,
    lineHeight: 23,
    marginBottom: 32 * scale,
  },
  // OTP row & boxes
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40 * scale,
  },
  otpBox: {
    width: 58 * scale,
    height: 58 * scale,
    borderWidth: 1.5,
    borderColor: '#E4DFDF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  otpBoxActive: {
    borderColor: colors.primary,
  },
  otpBoxFilled: {
    borderColor: '#E4DFDF',
  },
  otpInput: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textDark,
    textAlign: 'center',
    width: '100%',
    height: '100%',
    padding: 0,
  },
  otpDash: {
    fontSize: 22,
    color: '#B0B2C0',
    fontWeight: 'bold',
  },
  // Continue button
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: 15,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 6,
    marginBottom: 28 * scale,
  },
  continueButtonText: {
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
  // Resend code row
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resendText: {
    fontSize: 15,
    color: colors.textDark,
  },
  timerText: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '500',
  },
});

export default styles;
