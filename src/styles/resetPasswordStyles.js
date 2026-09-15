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
    marginBottom: 28 * scale,
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
    marginBottom: 40 * scale,
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
  // Send button
  sendButton: {
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
  },
  sendButtonText: {
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
});

export default styles;
