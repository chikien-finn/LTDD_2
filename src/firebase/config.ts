import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';

/**
 * CẤU HÌNH FIREBASE REALTIME DATABASE CHO DỰ ÁN
 */
export const firebaseConfig = {
  apiKey: "AIzaSyCf8b7zRdSn1Xo1LZZZmrCw1tXObvKgq2o",
  authDomain: "cuahangthongminhesp32.firebaseapp.com",
  databaseURL: "https://cuahangthongminhesp32-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "cuahangthongminhesp32",
  storageBucket: "cuahangthongminhesp32.firebasestorage.app",
  messagingSenderId: "1020979877662",
  appId: "1:1020979877662:web:36f5e86552e914dedbdb0f",
  measurementId: "G-40K2ZN96TK"
};

// Kiểm tra xem cấu hình đã sẵn sàng chưa
export const isFirebaseConfigured = () => {
  return (
    Boolean(firebaseConfig.apiKey) &&
    firebaseConfig.apiKey !== "AIzaSyYOUR_API_KEY_HERE" &&
    firebaseConfig.databaseURL.includes(".firebasedatabase.app")
  );
};

// Khởi tạo Firebase App an toàn (tránh khởi tạo lại nhiều lần khi hot reload)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const database: Database = getDatabase(app);
export default app;
