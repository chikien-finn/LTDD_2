import { StyleSheet } from 'react-native';
import colors from '../constants/colors';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 242,
    height: 58,
  },
  // Pastel background blobs
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobTopRight: {
    width: 227,
    height: 209,
    backgroundColor: colors.pastelPink,
    opacity: 0.2,
    top: -104,
    left: 187,
  },
  blobTopLeft: {
    width: 150,
    height: 150,
    backgroundColor: colors.pastelYellow,
    opacity: 0.15,
    top: 30,
    left: -40,
  },
  blobBottomLeft: {
    width: 180,
    height: 180,
    backgroundColor: colors.pastelCyan,
    opacity: 0.15,
    bottom: -40,
    left: -20,
  },
  blobBottomRight: {
    width: 160,
    height: 160,
    backgroundColor: colors.pastelPink,
    opacity: 0.15,
    bottom: -30,
    right: -30,
  },
});

export default styles;
