import { ref, onValue, set, update, push, off } from 'firebase/database';
import { database, isFirebaseConfigured } from './config';

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  tagUid: string;
  tagLabel: string;
  isPaid: boolean;
  icon: string;
}

export interface GateStatus {
  status: 'ONLINE' | 'OFFLINE';
  lastSeen: string;
  lastScannedUid: string;
  lastScannedStatus: 'PASS' | 'ALERT' | 'IDLE';
  lastMessage: string;
}

export interface EnvironmentData {
  temperature: number;
  humidity: number;
  lastUpdated: string;
}

export interface ScanLog {
  id: string;
  time: string;
  productName: string;
  tagUid: string;
  status: 'PASS' | 'ALERT';
  message: string;
}

// 2 sản phẩm mẫu ban đầu chuẩn bị cho Firebase
export const DEFAULT_PRODUCTS: Record<string, Product> = {
  'prod_1': {
    id: '1',
    name: 'Áo Polo Thể Thao Nam',
    category: 'Thời trang nam',
    price: 250000,
    tagUid: '73D2A11B',
    tagLabel: 'Thẻ trắng (Card)',
    isPaid: false,
    icon: '👕',
  },
  'prod_2': {
    id: '2',
    name: 'Quần Jean Denim Regular',
    category: 'Thời trang nam',
    price: 380000,
    tagUid: 'F32C9AF7',
    tagLabel: 'Móc khóa xanh (Keyfob)',
    isPaid: false,
    icon: '👖',
  },
};

/**
 * Khởi tạo dữ liệu mẫu lên Firebase nếu database đang trống
 */
export const seedInitialDatabase = async (): Promise<boolean> => {
  if (!isFirebaseConfigured()) return false;
  try {
    await set(ref(database, 'products'), DEFAULT_PRODUCTS);
    await set(ref(database, 'gate'), {
      status: 'ONLINE',
      lastSeen: new Date().toLocaleTimeString('vi-VN'),
      lastScannedUid: '',
      lastScannedStatus: 'IDLE',
      lastMessage: 'Cổng an ninh sẵn sàng',
    });
    await set(ref(database, 'environment'), {
      temperature: 28.5,
      humidity: 62.0,
      lastUpdated: new Date().toLocaleTimeString('vi-VN'),
    });
    return true;
  } catch (error) {
    console.warn('Lỗi seed data Firebase:', error);
    return false;
  }
};

/**
 * Lắng nghe danh sách sản phẩm thời gian thực
 */
export const subscribeProducts = (onData: (products: Product[]) => void) => {
  if (!isFirebaseConfigured()) {
    onData(Object.values(DEFAULT_PRODUCTS));
    return () => {};
  }

  const productsRef = ref(database, 'products');
  const unsubscribe = onValue(
    productsRef,
    (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list: Product[] = Object.values(data);
        onData(list);
      } else {
        // Chưa có dữ liệu thì tự động tạo mẫu
        seedInitialDatabase().then(() => {
          onData(Object.values(DEFAULT_PRODUCTS));
        });
      }
    },
    (error) => {
      console.warn('Lỗi đọc products từ Firebase:', error);
      onData(Object.values(DEFAULT_PRODUCTS));
    }
  );

  return () => off(productsRef, 'value', unsubscribe);
};

const RTDB_URL = "https://cuahangthongminhesp32-default-rtdb.asia-southeast1.firebasedatabase.app";

/**
 * Đọc trực tiếp danh sách sản phẩm từ Firebase REST API
 */
export const fetchProductsDirect = async (): Promise<Product[] | null> => {
  try {
    const res = await fetch(`${RTDB_URL}/products.json`);
    const data = await res.json();
    if (data) {
      return Object.values(data);
    }
    return null;
  } catch (e) {
    console.error('Lỗi fetchProductsDirect:', e);
    return null;
  }
};

/**
 * Cập nhật trạng thái thanh toán của sản phẩm (Thanh toán / Hủy thanh toán)
 * Sử dụng REST API trực tiếp để đảm bảo 100% cập nhật tức thì
 */
export const updateProductPayment = async (productId: string, isPaid: boolean): Promise<boolean> => {
  try {
    const productKey = `prod_${productId}`;
    
    // 1. Gửi HTTP PATCH trực tiếp tới Firebase REST API (siêu tin cậy)
    await fetch(`${RTDB_URL}/products/${productKey}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPaid }),
    });

    // 2. Đồng thời update qua Firebase SDK nếu có
    if (isFirebaseConfigured()) {
      try {
        await update(ref(database, `products/${productKey}`), { isPaid });
      } catch (_) {}
    }

    return true;
  } catch (error) {
    console.error('Lỗi cập nhật thanh toán Firebase:', error);
    return false;
  }
};

/**
 * Cập nhật UID thẻ RFID cho sản phẩm
 */
export const updateProductUid = async (productId: string, newUid: string): Promise<boolean> => {
  try {
    const productKey = `prod_${productId}`;
    const cleanUid = newUid.toUpperCase().trim();
    await fetch(`${RTDB_URL}/products/${productKey}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagUid: cleanUid }),
    });
    return true;
  } catch (error) {
    console.error('Lỗi cập nhật UID Firebase:', error);
    return false;
  }
};

/**
 * Thêm sản phẩm mới vào Firebase
 */
export const addProduct = async (product: Product): Promise<boolean> => {
  try {
    const productKey = `prod_${product.id}`;
    await fetch(`${RTDB_URL}/products/${productKey}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    return true;
  } catch (error) {
    console.error('Lỗi thêm sản phẩm:', error);
    return false;
  }
};

/**
 * Xóa sản phẩm khỏi Firebase
 */
export const deleteProduct = async (productId: string): Promise<boolean> => {
  try {
    const productKey = `prod_${productId}`;
    await fetch(`${RTDB_URL}/products/${productKey}.json`, {
      method: 'DELETE',
    });
    return true;
  } catch (error) {
    console.error('Lỗi xóa sản phẩm:', error);
    return false;
  }
};

/**
 * Lắng nghe thông số môi trường (Nhiệt độ & Độ ẩm từ cảm biến DHT)
 */
export const subscribeEnvironment = (onData: (data: EnvironmentData) => void) => {
  if (!isFirebaseConfigured()) {
    onData({ temperature: 28.5, humidity: 62.0, lastUpdated: 'Mặc định' });
    return () => {};
  }

  const envRef = ref(database, 'environment');
  const unsubscribe = onValue(envRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      onData(data);
    }
  });

  return () => off(envRef, 'value', unsubscribe);
};

/**
 * Lắng nghe trạng thái cổng an ninh ESP32
 */
export const subscribeGateStatus = (onData: (data: GateStatus) => void) => {
  if (!isFirebaseConfigured()) {
    onData({
      status: 'ONLINE',
      lastSeen: 'Vừa xong',
      lastScannedUid: '',
      lastScannedStatus: 'IDLE',
      lastMessage: 'Chế độ Demo (Chưa cấu hình Firebase)',
    });
    return () => {};
  }

  const gateRef = ref(database, 'gate');
  const unsubscribe = onValue(gateRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      onData(data);
    }
  });

  return () => off(gateRef, 'value', unsubscribe);
};

/**
 * Lắng nghe nhật ký quét an ninh
 */
export const subscribeLogs = (onData: (logs: ScanLog[]) => void) => {
  if (!isFirebaseConfigured()) {
    return () => {};
  }

  const logsRef = ref(database, 'logs');
  const unsubscribe = onValue(logsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const list: ScanLog[] = Object.keys(data)
        .map((key) => ({
          id: key,
          ...data[key],
        }))
        .reverse(); // Mới nhất lên đầu
      onData(list);
    } else {
      onData([]);
    }
  });

  return () => off(logsRef, 'value', unsubscribe);
};

/**
 * Ghi 1 bản ghi quét mới (dành cho mô phỏng trên App hoặc test)
 */
export const pushSecurityLog = async (log: Omit<ScanLog, 'id'>) => {
  if (!isFirebaseConfigured()) return;
  try {
    const logsRef = ref(database, 'logs');
    await push(logsRef, {
      ...log,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Lỗi ghi log Firebase:', error);
  }
};
