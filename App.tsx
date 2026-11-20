import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Animated,
  Easing,
  LayoutAnimation,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { isFirebaseConfigured } from './src/firebase/config';
import { mqttService } from './src/mqtt/mqttService';
import {
  Product,
  GateStatus,
  EnvironmentData,
  ScanLog,
  DEFAULT_PRODUCTS,
  subscribeProducts,
  updateProductPayment,
  updateProductUid,
  subscribeEnvironment,
  subscribeGateStatus,
  subscribeLogs,
  pushSecurityLog,
  fetchProductsDirect,
  addProduct,
  deleteProduct,
} from './src/firebase/databaseService';
import { COLORS, RADIUS, MONO, shadow } from './src/ui/theme';
import {
  ScalePress,
  PulseDot,
  ProgressBar,
  EmptyState,
  Toast,
  ToastData,
  ToastType,
  IconName,
} from './src/ui/components';

type TabType = 'unpaid' | 'paid' | 'security' | 'revenue';

export const CATEGORY_OPTIONS: { key: string; icon: IconName; label: string }[] = [
  { key: 'áo', icon: 'shirt-outline', label: 'Áo' },
  { key: 'quần', icon: 'bag-handle-outline', label: 'Quần' },
  { key: 'khoác', icon: 'shirt-outline', label: 'Khoác' },
  { key: 'váy', icon: 'pricetag-outline', label: 'Váy' },
  { key: 'giày', icon: 'footsteps-outline', label: 'Giày' },
  { key: 'nón', icon: 'baseball-outline', label: 'Nón' },
  { key: 'balo', icon: 'briefcase-outline', label: 'Balo' },
  { key: 'kính', icon: 'glasses-outline', label: 'Kính' },
];

export const getCategoryIcon = (iconOrCat: string): IconName => {
  const s = (iconOrCat || '').toLowerCase();
  if (s.includes('áo') || s.includes('shirt') || s.includes('👕')) return 'shirt-outline';
  if (s.includes('quần') || s.includes('jean') || s.includes('pants') || s.includes('👖')) return 'bag-handle-outline';
  if (s.includes('khoác') || s.includes('jacket') || s.includes('🧥')) return 'shirt-outline';
  if (s.includes('váy') || s.includes('đầm') || s.includes('dress') || s.includes('👗')) return 'pricetag-outline';
  if (s.includes('giày') || s.includes('dép') || s.includes('shoes') || s.includes('👟')) return 'footsteps-outline';
  if (s.includes('nón') || s.includes('mũ') || s.includes('hat') || s.includes('🧢')) return 'baseball-outline';
  if (s.includes('balo') || s.includes('cặp') || s.includes('bag') || s.includes('🎒')) return 'briefcase-outline';
  if (s.includes('kính') || s.includes('glasses') || s.includes('🕶️')) return 'glasses-outline';
  return 'pricetag-outline';
};

const MAX_LOGS_SHOWN = 50;
const NAV_HEIGHT = 64;

/* ---------------------------- Tiện ích ---------------------------- */
const formatCurrency = (val: number) => (val || 0).toLocaleString('vi-VN') + ' đ';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const haptic = {
  light: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  success: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  error: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};

const animateLayout = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));

const getDateLabel = () => {
  const d = new Date();
  const days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${days[d.getDay()]}, ${dd}/${mm}/${d.getFullYear()}`;
};

const formatLogTime = (time: string) =>
  time && time.includes('s') && !time.includes(':') ? `${time} trước` : time;

/* =================================================================== */
export default function App() {
  return (
    <SafeAreaProvider>
      <SmartStoreScreen />
    </SafeAreaProvider>
  );
}

function SmartStoreScreen() {
  const insets = useSafeAreaInsets();

  const [isConfigured] = useState<boolean>(isFirebaseConfigured());
  const [products, setProducts] = useState<Product[]>(Object.values(DEFAULT_PRODUCTS));
  const [gate, setGate] = useState<GateStatus>({
    status: 'ONLINE',
    lastSeen: 'Vừa xong',
    lastScannedUid: '',
    lastScannedStatus: 'IDLE',
    lastMessage: 'Cổng an ninh sẵn sàng',
  });
  const [environment, setEnvironment] = useState<EnvironmentData>({
    temperature: 28.5,
    humidity: 62.0,
    lastUpdated: 'Vừa xong',
  });
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [isMqttConnected, setIsMqttConnected] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<TabType>('unpaid');
  const [query, setQuery] = useState<string>('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempUid, setTempUid] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Modal Thêm sản phẩm mới
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newPrice, setNewPrice] = useState<string>('250000');
  const [newUid, setNewUid] = useState<string>('');
  const [newTagLabel, setNewTagLabel] = useState<string>('Móc khóa #3');
  const [newIcon, setNewIcon] = useState<string>('👕');

  // Popup cảnh báo trộm / vi phạm an ninh
  const [theftAlert, setTheftAlert] = useState<{
    visible: boolean;
    productName: string;
    tagUid: string;
    time: string;
    price?: number;
    productId?: string;
  } | null>(null);

  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // Toast
  const [toast, setToast] = useState<ToastData | null>(null);
  const showToast = useCallback((type: ToastType, title: string, message?: string) => {
    setToast({ id: Date.now(), type, title, message });
  }, []);

  // Hiệu ứng xoay nút đồng bộ
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isSyncing) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [isSyncing, spin]);
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // Đăng ký lắng nghe Firebase Realtime Database & MQTT Broker
  useEffect(() => {
    const unsubProducts = subscribeProducts((data) => {
      if (data && data.length > 0) {
        setProducts(data);
      }
    });

    const unsubGate = subscribeGateStatus((data) => {
      if (data) setGate(data);
    });

    const unsubEnv = subscribeEnvironment((data) => {
      if (data) setEnvironment(data);
    });

    const unsubLogs = subscribeLogs((data) => {
      if (data) setLogs(data);
    });

    // Khởi tạo MQTT lắng nghe trực tiếp từ ESP32
    mqttService.init({
      onConnectionChange: (connected) => {
        setIsMqttConnected(connected);
      },
      onDht: (data) => {
        setEnvironment((prev) => ({
          ...prev,
          temperature: data.temperature,
          humidity: data.humidity,
          lastUpdated: 'Vừa xong (MQTT)',
        }));
      },
      onRfid: (data) => {
        const now = new Date();
        const timeFormatted =
          data.time ||
          `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;

        const isPaid = data.status === 'PAID';
        setGate((prev) => ({
          ...prev,
          lastSeen: timeFormatted,
          lastScannedUid: data.uid,
          lastScannedStatus: isPaid ? 'PASS' : 'ALERT',
          lastMessage: `${data.product}: ${data.note || data.status}`,
        }));

        const newLogEntry: ScanLog = {
          id: 'log_' + Date.now(),
          time: timeFormatted,
          productName: data.product,
          tagUid: data.uid,
          status: isPaid ? 'PASS' : 'ALERT',
          message:
            data.note ||
            (isPaid
              ? 'Đã thanh toán - Cho phép qua'
              : 'CẢNH BÁO: Chưa thanh toán!'),
        };
        setLogs((prev) => [
          newLogEntry,
          ...prev.filter((l) => l.tagUid !== data.uid || l.time !== timeFormatted),
        ]);

        // Nếu sản phẩm chưa thanh toán -> Kích hoạt rung và bật popup cảnh báo màu đỏ
        if (!isPaid) {
          haptic.error();
          const matched = productsRef.current.find(
            (p) => p.tagUid.toUpperCase() === (data.uid || '').toUpperCase()
          );
          setTheftAlert({
            visible: true,
            productName: data.product || matched?.name || 'Sản phẩm chưa rõ',
            tagUid: data.uid,
            time: timeFormatted,
            price: matched?.price,
            productId: matched?.id,
          });
        }
      },
      onGate: (status) => {
        setGate((prev) => ({
          ...prev,
          status: 'ONLINE',
          lastMessage:
            status === 'OPENED'
              ? 'Cổng Barrier đang mở'
              : status === 'CLOSED'
              ? 'Cổng Barrier đã đóng'
              : prev.lastMessage,
        }));
      },
    });

    return () => {
      unsubProducts();
      unsubGate();
      unsubEnv();
      unsubLogs();
      mqttService.disconnect();
    };
  }, []);

  /* ------------------------- Dữ liệu dẫn xuất ------------------------- */
  const unpaidProducts = products.filter((p) => !p.isPaid);
  const paidProducts = products.filter((p) => p.isPaid);
  const unpaidTotal = unpaidProducts.reduce((sum, item) => sum + (item.price || 0), 0);
  const paidTotal = paidProducts.reduce((sum, item) => sum + (item.price || 0), 0);
  const alertCount = logs.filter((l) => l.status === 'ALERT').length;

  const q = query.trim().toLowerCase();
  const matches = (p: Product) =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    p.tagUid.toLowerCase().includes(q) ||
    (p.category || '').toLowerCase().includes(q);
  const visibleUnpaid = unpaidProducts.filter(matches);
  const visiblePaid = paidProducts.filter(matches);

  const isGateOnline = gate.status === 'ONLINE';
  const hasUnknownChip =
    Boolean(gate.lastScannedUid) &&
    !products.some((p) => p.tagUid.toUpperCase() === gate.lastScannedUid.toUpperCase());

  const temp = environment.temperature;
  const hum = environment.humidity;
  const tempStatus = temp > 32 ? 'Hơi nóng' : temp < 18 ? 'Hơi lạnh' : 'Lý tưởng';
  const humStatus = hum > 75 ? 'Độ ẩm cao' : hum < 35 ? 'Hơi khô' : 'Ổn định';

  /* ----------------------------- Hành động ----------------------------- */
  const changeTab = (tab: TabType) => {
    if (tab === activeTab) return;
    haptic.light();
    animateLayout();
    setActiveTab(tab);
    setEditingId(null);
  };

  const handleManualSync = async () => {
    haptic.light();
    setIsSyncing(true);
    const freshData = await fetchProductsDirect();
    setIsSyncing(false);
    if (freshData && freshData.length > 0) {
      animateLayout();
      setProducts(freshData);
      haptic.success();
      showToast('success', 'Đã đồng bộ dữ liệu', 'Dữ liệu mới nhất đã được tải từ Firebase.');
    } else {
      haptic.error();
      showToast('error', 'Không thể đồng bộ', 'Vui lòng kiểm tra lại kết nối mạng.');
    }
  };

  // 1. THANH TOÁN SẢN PHẨM
  const handlePayProduct = async (item: Product) => {
    animateLayout();
    setProducts((prev) => prev.map((p) => (p.id === item.id ? { ...p, isPaid: true } : p)));
    haptic.success();
    showToast('success', 'Thanh toán thành công', `"${item.name}" đã có thể qua cổng an ninh.`);
    await updateProductPayment(item.id, true);
  };

  // 2. ĐẶT LẠI CHƯA TRẢ
  const handleRefundProduct = async (item: Product) => {
    animateLayout();
    setProducts((prev) => prev.map((p) => (p.id === item.id ? { ...p, isPaid: false } : p)));
    haptic.warning();
    showToast('info', 'Đã đặt lại chưa thanh toán', `Mang "${item.name}" qua cổng sẽ kích hoạt còi.`);
    await updateProductPayment(item.id, false);
  };

  // 3. THÊM SẢN PHẨM MỚI
  const handleCreateProduct = async () => {
    if (!newName.trim()) {
      haptic.error();
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên món đồ!');
      return;
    }
    if (!newUid.trim()) {
      haptic.error();
      Alert.alert('Thiếu mã RFID', 'Vui lòng nhập mã UID của chip/móc khóa!');
      return;
    }

    const cleanUid = newUid.trim().toUpperCase().replace(/\s+/g, '');
    const newProd: Product = {
      id: Date.now().toString(),
      name: newName.trim(),
      category: 'Thời trang thông minh',
      price: parseInt(newPrice, 10) || 200000,
      tagUid: cleanUid,
      tagLabel: newTagLabel.trim() || `Móc khóa #${products.length + 1}`,
      isPaid: false,
      icon: newIcon,
    };

    animateLayout();
    setProducts((prev) => [...prev, newProd]);
    setShowAddModal(false);
    setActiveTab('unpaid');

    setNewName('');
    setNewPrice('250000');
    setNewUid('');
    setNewTagLabel(`Móc khóa #${products.length + 2}`);

    haptic.success();
    showToast('success', 'Đã thêm món đồ mới', `${newProd.name} • UID ${newProd.tagUid}`);
    await addProduct(newProd);
  };

  // 4. XÓA SẢN PHẨM
  const handleDeleteProduct = (item: Product) => {
    haptic.warning();
    Alert.alert('Xóa sản phẩm?', `"${item.name}" (UID: ${item.tagUid}) sẽ bị xóa khỏi hệ thống.`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          animateLayout();
          setProducts((prev) => prev.filter((p) => p.id !== item.id));
          showToast('info', 'Đã xóa sản phẩm', item.name);
          await deleteProduct(item.id);
        },
      },
    ]);
  };

  // Lưu mã UID sửa trực tiếp
  const handleSaveUid = async (id: string) => {
    if (!tempUid.trim()) {
      setEditingId(null);
      return;
    }
    const cleanUid = tempUid.trim().toUpperCase().replace(/\s+/g, '');
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, tagUid: cleanUid } : p)));
    setEditingId(null);
    setTempUid('');
    haptic.success();
    showToast('success', 'Đã cập nhật mã UID', cleanUid);
    await updateProductUid(id, cleanUid);
  };

  // Giả lập quét cổng an ninh
  const simulateGateScan = async (product: Product) => {
    const timeStr = new Date().toTimeString().split(' ')[0];
    const isSuccess = product.isPaid;

    const logEntry = {
      time: timeStr,
      productName: product.name,
      tagUid: product.tagUid,
      status: isSuccess ? ('PASS' as const) : ('ALERT' as const),
      message: isSuccess
        ? 'ĐÃ THANH TOÁN - Cho phép qua cổng'
        : 'CẢNH BÁO: CHƯA THANH TOÁN! Kích hoạt còi báo động',
    };

    setLogs((prev) => [{ id: Date.now().toString(), ...logEntry }, ...prev]);

    if (isSuccess) {
      haptic.success();
      showToast('success', 'Cổng an toàn', `${product.name} • OLED hiển thị "Cảm ơn"`);
    } else {
      haptic.error();
      showToast('error', 'Cảnh báo báo động!', `${product.name} chưa thanh toán • Còi Buzzer hú`);
      setTheftAlert({
        visible: true,
        productName: product.name,
        tagUid: product.tagUid,
        time: timeStr,
        price: product.price,
        productId: product.id,
      });
    }
    await pushSecurityLog(logEntry);
  };

  // Thanh toán nhanh từ Popup cảnh báo vi phạm
  const handleTheftPayNow = async () => {
    if (!theftAlert) return;
    const prod = products.find(
      (p) =>
        p.id === theftAlert.productId ||
        p.tagUid.toUpperCase() === (theftAlert.tagUid || '').toUpperCase()
    );
    setTheftAlert(null);
    if (prod) {
      await handlePayProduct(prod);
    } else {
      showToast('info', 'Đã đóng cảnh báo');
    }
  };

  const sendGate = (cmd: 'OPEN' | 'CLOSE') => {
    const sent = mqttService.sendGateCommand(cmd);
    if (sent) {
      haptic.success();
      showToast(
        'success',
        cmd === 'OPEN' ? 'Đã gửi lệnh mở cổng' : 'Đã gửi lệnh đóng cổng',
        'Lệnh đã được gửi qua MQTT tới ESP32.'
      );
    } else {
      haptic.error();
      showToast('error', 'Chưa kết nối MQTT', 'App chưa kết nối được tới MQTT broker.');
    }
  };

  const openAddModal = (prefillUid?: string) => {
    haptic.light();
    if (prefillUid) {
      setNewUid(prefillUid);
    } else if (hasUnknownChip) {
      setNewUid(gate.lastScannedUid);
    }
    setNewTagLabel(`Móc khóa #${products.length + 1}`);
    setShowAddModal(true);
  };

  /* ------------------------------ Render ------------------------------ */
  const TABS: { key: TabType; label: string; icon: IconName; iconActive: IconName; count: number }[] = [
    { key: 'unpaid', label: 'Chưa trả', icon: 'cart-outline', iconActive: 'cart', count: unpaidProducts.length },
    { key: 'paid', label: 'Đã trả', icon: 'bag-check-outline', iconActive: 'bag-check', count: paidProducts.length },
    { key: 'security', label: 'An ninh', icon: 'shield-outline', iconActive: 'shield-checkmark', count: alertCount },
    { key: 'revenue', label: 'Doanh thu', icon: 'bar-chart-outline', iconActive: 'bar-chart', count: 0 },
  ];

  const navBottom = Math.max(insets.bottom, 14) + 2;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: NAV_HEIGHT + navBottom + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---------------- Top bar ---------------- */}
        <View style={styles.topBar}>
          <View style={styles.topBarText}>
            <Text style={styles.greeting}>Hệ thống bán lẻ & an ninh RFID</Text>
            <Text style={styles.brand}>Smart Store</Text>
            <View style={styles.dateRow}>
              <Ionicons name="calendar-clear-outline" size={12} color={COLORS.inkMuted} />
              <Text style={styles.dateText}>{getDateLabel()}</Text>
              <View style={styles.dotSep} />
              <Ionicons
                name={isConfigured ? 'cloud-done-outline' : 'cloud-offline-outline'}
                size={12}
                color={isConfigured ? COLORS.sage : COLORS.inkMuted}
              />
              <Text style={styles.dateText}>{isConfigured ? 'Cloud' : 'Offline'}</Text>
            </View>
          </View>

          <ScalePress
            style={styles.iconBtn}
            onPress={handleManualSync}
            disabled={isSyncing}
            scaleTo={0.9}
          >
            <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
              <Ionicons name="sync" size={20} color={COLORS.ink} />
            </Animated.View>
          </ScalePress>
        </View>

        {/* ---------------- Banner chip mới ---------------- */}
        {hasUnknownChip && (
          <View style={styles.detectBanner}>
            <View style={styles.detectIcon}>
              <Ionicons name="hardware-chip-outline" size={18} color={COLORS.amber} />
            </View>
            <View style={styles.detectText}>
              <Text style={styles.detectTitle}>Phát hiện chip RFID mới</Text>
              <Text style={styles.detectUid}>{gate.lastScannedUid}</Text>
            </View>
            <ScalePress style={styles.detectBtn} onPress={() => openAddModal(gate.lastScannedUid)}>
              <Text style={styles.detectBtnText}>Đăng ký</Text>
              <Ionicons name="arrow-forward" size={14} color={COLORS.champagne} />
            </ScalePress>
          </View>
        )}

        {/* ---------------- Tìm kiếm (tab sản phẩm) ---------------- */}
        {(activeTab === 'unpaid' || activeTab === 'paid') && (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={COLORS.inkMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm kiếm sản phẩm hoặc mã thẻ UID..."
              placeholderTextColor={COLORS.inkMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={COLORS.inkMuted} />
              </Pressable>
            ) : null}
          </View>
        )}

        {/* ================= TAB 1: CHƯA THANH TOÁN ================= */}
        {activeTab === 'unpaid' && (
          <View>
            <SectionHeader
              title="Chờ thanh toán"
              subtitle="Mang qua cổng ESP32 sẽ kích hoạt còi báo động"
              count={visibleUnpaid.length}
              tone="rose"
            />
            {visibleUnpaid.length === 0 ? (
              <EmptyState
                icon={q ? 'search-outline' : 'checkmark-circle-outline'}
                title={q ? 'Không tìm thấy sản phẩm' : 'Tất cả đã thanh toán'}
                desc={
                  q
                    ? `Không có món nào khớp với "${query}".`
                    : 'Không còn món đồ nào chưa trả tiền. Nhấn nút + để thêm món đồ mới.'
                }
              />
            ) : (
              visibleUnpaid.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  mode="unpaid"
                  isEditing={editingId === item.id}
                  tempUid={tempUid}
                  onChangeTempUid={setTempUid}
                  onStartEdit={() => {
                    animateLayout();
                    setEditingId(item.id);
                    setTempUid(item.tagUid);
                  }}
                  onCancelEdit={() => {
                    animateLayout();
                    setEditingId(null);
                    setTempUid('');
                  }}
                  onSaveUid={() => handleSaveUid(item.id)}
                  onPrimary={() => handlePayProduct(item)}
                  onSecondary={() => simulateGateScan(item)}
                  onDelete={() => handleDeleteProduct(item)}
                />
              ))
            )}
          </View>
        )}

        {/* ================= TAB 2: ĐÃ THANH TOÁN ================= */}
        {activeTab === 'paid' && (
          <View>
            <SectionHeader
              title="Đã thanh toán"
              subtitle="Hợp lệ và được phép đi qua cổng an ninh"
              count={visiblePaid.length}
              tone="sage"
            />
            {visiblePaid.length === 0 ? (
              <EmptyState
                icon={q ? 'search-outline' : 'bag-handle-outline'}
                title={q ? 'Không tìm thấy sản phẩm' : 'Chưa có món nào được trả tiền'}
                desc={
                  q
                    ? `Không có món nào khớp với "${query}".`
                    : 'Chuyển sang mục "Chưa trả" và nhấn "Thanh toán" để hoàn tất đơn hàng.'
                }
              />
            ) : (
              visiblePaid.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  mode="paid"
                  isEditing={false}
                  tempUid=""
                  onChangeTempUid={() => {}}
                  onStartEdit={() => {}}
                  onCancelEdit={() => {}}
                  onSaveUid={() => {}}
                  onPrimary={() => handleRefundProduct(item)}
                  onSecondary={() => simulateGateScan(item)}
                  onDelete={() => handleDeleteProduct(item)}
                />
              ))
            )}
          </View>
        )}

        {/* ================= TAB 3: AN NINH ================= */}
        {activeTab === 'security' && (
          <View>
            <SectionHeader
              title="Cổng an ninh & Môi trường"
              subtitle="Dữ liệu RC522 thời gian thực qua Firebase & MQTT"
            />

            {/* ---------------- Môi trường kho ---------------- */}
            <View style={styles.envRow}>
              <View style={styles.envCard}>
                <View style={styles.envHead}>
                  <View style={[styles.envIcon, { backgroundColor: COLORS.amberSoft }]}>
                    <Ionicons name="thermometer-outline" size={18} color={COLORS.amber} />
                  </View>
                  <View style={[styles.pill, { backgroundColor: COLORS.amberSoft }]}>
                    <Text style={[styles.pillText, { color: COLORS.amber, fontSize: 10 }]}>{tempStatus}</Text>
                  </View>
                </View>
                <Text style={styles.envValue}>
                  {temp.toFixed(1)}
                  <Text style={styles.envUnit}>°C</Text>
                </Text>
                <Text style={styles.envLabel}>Nhiệt độ kho</Text>
              </View>

              <View style={styles.envCard}>
                <View style={styles.envHead}>
                  <View style={[styles.envIcon, { backgroundColor: COLORS.tealSoft }]}>
                    <Ionicons name="water-outline" size={18} color={COLORS.teal} />
                  </View>
                  <View style={[styles.pill, { backgroundColor: COLORS.tealSoft }]}>
                    <Text style={[styles.pillText, { color: COLORS.teal, fontSize: 10 }]}>{humStatus}</Text>
                  </View>
                </View>
                <Text style={styles.envValue}>
                  {hum.toFixed(0)}
                  <Text style={styles.envUnit}>%</Text>
                </Text>
                <Text style={styles.envLabel}>Độ ẩm không khí</Text>
              </View>
            </View>

            {/* Trạng thái cổng */}
            {(() => {
              const s = gate.lastScannedStatus;
              const tone =
                s === 'ALERT'
                  ? { c: COLORS.rose, soft: COLORS.roseSoft, icon: 'warning-outline' as IconName, label: 'CẢNH BÁO AN NINH' }
                  : s === 'PASS'
                  ? { c: COLORS.sage, soft: COLORS.sageSoft, icon: 'shield-checkmark-outline' as IconName, label: 'HỢP LỆ' }
                  : { c: COLORS.primary, soft: COLORS.primarySoft, icon: 'scan-outline' as IconName, label: 'SẴN SÀNG' };
              return (
                <View style={styles.gateCard}>
                  <View style={[styles.gateIcon, { backgroundColor: tone.soft }]}>
                    <Ionicons name={tone.icon} size={24} color={tone.c} />
                  </View>
                  <View style={styles.gateInfo}>
                    <View style={[styles.pill, { backgroundColor: tone.soft, alignSelf: 'flex-start' }]}>
                      <Text style={[styles.pillText, { color: tone.c, fontWeight: '700' }]}>{tone.label}</Text>
                    </View>
                    <Text style={styles.gateMsg} numberOfLines={2}>
                      {gate.lastMessage || 'Cổng an ninh sẵn sàng'}
                    </Text>
                    {Boolean(gate.lastScannedUid) && (
                      <View style={styles.gateMeta}>
                        <Ionicons name="hardware-chip-outline" size={12} color={COLORS.inkMuted} />
                        <Text style={styles.gateUid}>{gate.lastScannedUid}</Text>
                        <View style={styles.dotSep} />
                        <Ionicons name="time-outline" size={12} color={COLORS.inkMuted} />
                        <Text style={styles.gateTime} numberOfLines={1}>
                          {gate.lastSeen}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

            {/* Điều khiển MQTT */}
            <View style={styles.mqttCard}>
              <View style={styles.mqttHead}>
                <View style={styles.mqttHeadIcon}>
                  <Ionicons name="git-network-outline" size={18} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mqttTitle}>Điều khiển Barrier</Text>
                  <Text style={styles.mqttSub}>ESP32 Servo • Realtime MQTT</Text>
                </View>
                <View
                  style={[
                    styles.pill,
                    { backgroundColor: isMqttConnected ? COLORS.sageSoft : COLORS.sand },
                  ]}
                >
                  {isMqttConnected ? <PulseDot color={COLORS.sage} size={6} /> : null}
                  <Text
                    style={[
                      styles.pillText,
                      { color: isMqttConnected ? COLORS.sage : COLORS.inkMuted },
                    ]}
                  >
                    {isMqttConnected ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>

              <View style={styles.mqttBtns}>
                <ScalePress style={[styles.mqttBtn, styles.mqttBtnOpen]} onPress={() => sendGate('OPEN')}>
                  <Ionicons name="lock-open-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.mqttBtnText}>Mở cổng</Text>
                </ScalePress>
                <ScalePress style={[styles.mqttBtn, styles.mqttBtnClose]} onPress={() => sendGate('CLOSE')}>
                  <Ionicons name="lock-closed-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.mqttBtnText}>Đóng cổng</Text>
                </ScalePress>
              </View>
            </View>

            {/* Lịch sử quét */}
            <View style={styles.logHead}>
              <Text style={styles.sectionTitle}>Lịch sử quét</Text>
              {logs.length > 0 && (
                <ScalePress
                  style={styles.clearBtn}
                  onPress={() => {
                    animateLayout();
                    setLogs([]);
                  }}
                >
                  <Ionicons name="trash-outline" size={13} color={COLORS.inkSoft} />
                  <Text style={styles.clearBtnText}>Xóa</Text>
                </ScalePress>
              )}
            </View>

            {logs.length === 0 ? (
              <EmptyState
                icon="shield-outline"
                title="Chưa có lượt quét nào"
                desc="Khi bạn quẹt thẻ qua đầu đọc RC522 của ESP32, nhật ký sẽ hiển thị tại đây."
              />
            ) : (
              <View>
                {logs.slice(0, MAX_LOGS_SHOWN).map((log, idx, arr) => {
                  const isAlert = log.status === 'ALERT';
                  const c = isAlert ? COLORS.rose : COLORS.sage;
                  return (
                    <View key={log.id} style={styles.tlRow}>
                      <View style={styles.tlRail}>
                        <View style={[styles.tlDot, { backgroundColor: c }]}>
                          <Ionicons name={isAlert ? 'warning' : 'checkmark'} size={11} color="#FFFFFF" />
                        </View>
                        {idx < arr.length - 1 ? <View style={styles.tlLine} /> : null}
                      </View>
                      <View style={styles.tlCard}>
                        <View style={styles.tlTop}>
                          <Text style={[styles.tlStatus, { color: c }]}>
                            {isAlert ? 'Cảnh báo trộm' : 'Qua cổng hợp lệ'}
                          </Text>
                          <Text style={styles.tlTime} numberOfLines={1}>
                            {formatLogTime(log.time)}
                          </Text>
                        </View>
                        <Text style={styles.tlProduct} numberOfLines={1}>
                          {log.productName}
                        </Text>
                        <View style={styles.tlMeta}>
                          <Ionicons name="radio-outline" size={12} color={COLORS.inkMuted} />
                          <Text style={styles.tlUid}>{log.tagUid}</Text>
                        </View>
                        {log.message ? (
                          <Text style={styles.tlMsg} numberOfLines={2}>
                            {log.message}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
                {logs.length > MAX_LOGS_SHOWN && (
                  <Text style={styles.moreLogs}>
                    Đang hiển thị {MAX_LOGS_SHOWN}/{logs.length} lượt quét gần nhất
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* ================= TAB 4: DOANH THU ================= */}
        {activeTab === 'revenue' && (
          <View>
            <SectionHeader
              title="Báo cáo Doanh thu"
              subtitle="Thống kê tài chính & dòng tiền cửa hàng thời gian thực"
            />

            {/* Hero card Doanh thu */}
            <LinearGradient
              colors={[COLORS.mocha, COLORS.espresso]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroTop}>
                <View style={styles.heroLabelRow}>
                  <Ionicons name="trending-up" size={14} color={COLORS.champagne} />
                  <Text style={styles.heroLabel}>Doanh thu thực thu</Text>
                </View>
                <View style={styles.heroStatus}>
                  <PulseDot color={isGateOnline ? '#7FD3A4' : '#F08A7E'} size={7} />
                  <Text style={styles.heroStatusText}>
                    {isGateOnline ? 'ESP32 Online' : 'ESP32 Offline'}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(paidTotal)}
              </Text>
              <Text style={styles.heroSub}>
                {paidProducts.length} món đã thanh toán •{' '}
                {isMqttConnected ? 'MQTT Realtime' : 'Firebase Cloud'}
              </Text>

              <View style={styles.heroDivider} />

              <View style={styles.heroStats}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCurrency(unpaidTotal)}
                  </Text>
                  <Text style={styles.heroStatLabel}>Chờ thanh toán</Text>
                </View>
                <View style={styles.heroStatSep} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>{products.length}</Text>
                  <Text style={styles.heroStatLabel}>Tổng sản phẩm</Text>
                </View>
                <View style={styles.heroStatSep} />
                <View style={styles.heroStat}>
                  <Text style={[styles.heroStatValue, alertCount > 0 && { color: '#F3A497' }]}>
                    {alertCount}
                  </Text>
                  <Text style={styles.heroStatLabel}>Cảnh báo</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Tiến độ hoàn thành */}
            <View style={styles.financeCard}>
              <View style={styles.financeHead}>
                <Text style={styles.financeTitle}>Tỷ lệ hoàn thành đơn</Text>
                <Text style={styles.financePercent}>
                  {products.length > 0 ? Math.round((paidProducts.length / products.length) * 100) : 0}%
                </Text>
              </View>
              <View style={styles.financeBarBg}>
                <View
                  style={[
                    styles.financeBarFill,
                    {
                      width: `${products.length > 0 ? Math.min(100, Math.round((paidProducts.length / products.length) * 100)) : 0}%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.financeMeta}>
                <Text style={styles.financeMetaText}>
                  Đã thu: <Text style={{ color: COLORS.sage, fontWeight: '700' }}>{formatCurrency(paidTotal)}</Text>
                </Text>
                <Text style={styles.financeMetaText}>
                  Tổng giá trị kho: <Text style={{ color: COLORS.ink, fontWeight: '700' }}>{formatCurrency(paidTotal + unpaidTotal)}</Text>
                </Text>
              </View>
            </View>

            {/* Bảng kê sản phẩm đã thu tiền */}
            <View style={styles.recentHead}>
              <Text style={styles.sectionTitle}>Sản phẩm đã thu tiền</Text>
              <Text style={styles.recentCount}>{paidProducts.length} món</Text>
            </View>

            {paidProducts.length === 0 ? (
              <EmptyState
                icon="cash-outline"
                title="Chưa có doanh thu"
                desc="Chuyển sang mục 'Chưa trả' và nhấn 'Thanh toán' để ghi nhận đơn hàng vào doanh thu."
              />
            ) : (
              paidProducts.map((item) => (
                <View key={item.id} style={styles.receiptRow}>
                  <View style={styles.receiptIcon}>
                    <Ionicons name={getCategoryIcon(item.icon || item.category || item.name)} size={18} color={COLORS.primary} />
                  </View>
                  <View style={styles.receiptInfo}>
                    <Text style={styles.receiptName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.receiptUid}>UID: {item.tagUid}</Text>
                  </View>
                  <View style={styles.receiptRight}>
                    <Text style={styles.receiptPrice}>+{formatCurrency(item.price)}</Text>
                    <Text style={styles.receiptStatus}>Đã thu</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* ---------------- Fixed bottom navigation ---------------- */}
      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <ScalePress
              key={t.key}
              onPress={() => changeTab(t.key)}
              style={styles.tabBtn}
              scaleTo={0.94}
            >
              <View style={styles.tabIconWrap}>
                <Ionicons
                  name={active ? t.iconActive : t.icon}
                  size={22}
                  color={active ? COLORS.primary : COLORS.inkMuted}
                />
                {t.count > 0 ? (
                  <View
                    style={[
                      styles.tabBadge,
                      t.key === 'security' && { backgroundColor: COLORS.rose },
                    ]}
                  >
                    <Text style={styles.tabBadgeText}>{t.count > 99 ? '99+' : t.count}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
                {t.label}
              </Text>
            </ScalePress>
          );
        })}
      </View>

      {/* ---------------- Floating Action Button (+) ---------------- */}
      {(activeTab === 'unpaid' || activeTab === 'paid') && (
        <ScalePress
          style={[styles.floatingFab, { bottom: Math.max(insets.bottom, 10) + 68 }]}
          onPress={() => openAddModal()}
          scaleTo={0.9}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </ScalePress>
      )}

      {/* ---------------- Toast ---------------- */}
      <Toast toast={toast} top={insets.top + 8} onHide={() => setToast(null)} />

      {/* ---------------- Bottom sheet: Thêm sản phẩm ---------------- */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAddModal(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Thêm món đồ mới</Text>
                <Text style={styles.sheetSub}>Gán chip RFID để theo dõi qua cổng an ninh</Text>
              </View>
              <ScalePress style={styles.sheetClose} onPress={() => setShowAddModal(false)} scaleTo={0.9}>
                <Ionicons name="close" size={18} color={COLORS.inkSoft} />
              </ScalePress>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Preview */}
              <View style={styles.previewCard}>
                <View style={styles.previewIcon}>
                  <Ionicons name={getCategoryIcon(newIcon)} size={26} color={COLORS.mocha} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewName} numberOfLines={1}>
                    {newName.trim() || 'Tên món đồ'}
                  </Text>
                  <Text style={styles.previewPrice}>
                    {formatCurrency(parseInt(newPrice, 10) || 0)}
                  </Text>
                </View>
                <View style={styles.previewUid}>
                  <Text style={styles.previewUidText} numberOfLines={1}>
                    {newUid.trim().toUpperCase() || 'UID'}
                  </Text>
                </View>
              </View>

              <Text style={styles.fieldLabel}>Phân loại mặt hàng</Text>
              <View style={styles.iconGrid}>
                {CATEGORY_OPTIONS.map((opt) => {
                  const selected = newIcon === opt.key;
                  return (
                    <ScalePress
                      key={opt.key}
                      style={[styles.iconChoice, selected && styles.iconChoiceSelected]}
                      onPress={() => {
                        haptic.light();
                        setNewIcon(opt.key);
                      }}
                      scaleTo={0.93}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={18}
                        color={selected ? COLORS.champagne : COLORS.inkSoft}
                      />
                      <Text
                        style={[
                          styles.iconChoiceLabel,
                          selected && { color: COLORS.champagne, fontWeight: '600' },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </ScalePress>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Tên món đồ</Text>
              <View style={styles.field}>
                <Ionicons name="shirt-outline" size={18} color={COLORS.inkMuted} />
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Ví dụ: Áo Khoác Gió Nam"
                  placeholderTextColor={COLORS.inkMuted}
                  value={newName}
                  onChangeText={setNewName}
                />
              </View>

              <Text style={styles.fieldLabel}>Giá bán</Text>
              <View style={styles.field}>
                <Ionicons name="cash-outline" size={18} color={COLORS.inkMuted} />
                <TextInput
                  style={styles.fieldInput}
                  placeholder="250000"
                  placeholderTextColor={COLORS.inkMuted}
                  keyboardType="numeric"
                  value={newPrice}
                  onChangeText={(v) => setNewPrice(v.replace(/[^0-9]/g, ''))}
                />
                <Text style={styles.fieldSuffix}>VNĐ</Text>
              </View>

              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, { marginTop: 0, marginBottom: 0 }]}>Mã UID chip RFID</Text>
                {Boolean(gate.lastScannedUid) && (
                  <ScalePress style={styles.quickFill} onPress={() => setNewUid(gate.lastScannedUid)}>
                    <Ionicons name="flash" size={11} color={COLORS.amber} />
                    <Text style={styles.quickFillText}>Dùng {gate.lastScannedUid}</Text>
                  </ScalePress>
                )}
              </View>
              <View style={styles.field}>
                <Ionicons name="radio-outline" size={18} color={COLORS.inkMuted} />
                <TextInput
                  style={[styles.fieldInput, styles.fieldMono]}
                  placeholder="A1B2C3D4"
                  placeholderTextColor={COLORS.inkMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={newUid}
                  onChangeText={setNewUid}
                />
              </View>
              <Text style={styles.fieldHint}>Quẹt chip qua cổng ESP32 để tự động nhận mã.</Text>

              <Text style={styles.fieldLabel}>Nhãn móc khóa</Text>
              <View style={styles.field}>
                <Ionicons name="pricetag-outline" size={18} color={COLORS.inkMuted} />
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Ví dụ: Móc khóa #3"
                  placeholderTextColor={COLORS.inkMuted}
                  value={newTagLabel}
                  onChangeText={setNewTagLabel}
                />
              </View>

              <View style={styles.sheetBtns}>
                <ScalePress style={styles.btnGhost} onPress={() => setShowAddModal(false)}>
                  <Text style={styles.btnGhostText}>Hủy</Text>
                </ScalePress>
                <ScalePress style={styles.btnPrimaryWrap} onPress={handleCreateProduct}>
                  <LinearGradient
                    colors={[COLORS.mocha, COLORS.espresso]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.btnPrimary}
                  >
                    <Ionicons name="cloud-upload-outline" size={18} color={COLORS.champagne} />
                    <Text style={styles.btnPrimaryText}>Lưu lên hệ thống</Text>
                  </LinearGradient>
                </ScalePress>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ============================================================= */}
      {/* Popup màu đỏ cảnh báo chống trộm / vi phạm an ninh             */}
      {/* ============================================================= */}
      <Modal
        visible={Boolean(theftAlert?.visible)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setTheftAlert(null)}
      >
        <View style={styles.theftBackdrop}>
          <View style={styles.theftCard}>
            {/* Header màu đỏ báo động */}
            <LinearGradient
              colors={['#DC2626', '#991B1B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.theftHeader}
            >
              <View style={styles.theftIconCircle}>
                <Ionicons name="warning" size={34} color="#FFFFFF" />
              </View>
              <Text style={styles.theftTitle}>CẢNH BÁO VI PHẠM AN NINH</Text>
              <Text style={styles.theftSubtitle}>
                Phát hiện hàng chưa thanh toán đi qua cổng kiểm soát!
              </Text>
            </LinearGradient>

            {/* Chi tiết sản phẩm bị trộm */}
            <View style={styles.theftBody}>
              <View style={styles.theftInfoBox}>
                <View style={styles.theftInfoHead}>
                  <Text style={styles.theftProdName} numberOfLines={2}>
                    {theftAlert?.productName || 'Mặt hàng chưa xác định'}
                  </Text>
                  {typeof theftAlert?.price === 'number' && theftAlert.price > 0 && (
                    <Text style={styles.theftProdPrice}>
                      {formatCurrency(theftAlert.price)}
                    </Text>
                  )}
                </View>

                <View style={styles.theftMetaRow}>
                  <View style={styles.theftMetaItem}>
                    <Ionicons name="radio-outline" size={14} color={COLORS.rose} />
                    <Text style={styles.theftMetaText}>UID: {theftAlert?.tagUid || 'N/A'}</Text>
                  </View>
                  <View style={styles.theftMetaItem}>
                    <Ionicons name="time-outline" size={14} color={COLORS.inkMuted} />
                    <Text style={styles.theftMetaText}>{theftAlert?.time || 'Vừa xong'}</Text>
                  </View>
                </View>

                <View style={styles.theftStatusBadge}>
                  <View style={styles.theftStatusDot} />
                  <Text style={styles.theftStatusBadgeText}>CHƯA THANH TOÁN (UNPAID)</Text>
                </View>
              </View>

              {/* Tình trạng các cơ chế bảo vệ */}
              <View style={styles.theftSecurityBox}>
                <View style={styles.theftSecurityRow}>
                  <Ionicons name="volume-high" size={16} color={COLORS.rose} />
                  <Text style={styles.theftSecurityText}>
                    Còi Buzzer tại cổng: <Text style={styles.theftSecurityAlert}>ĐANG BÁO ĐỘNG</Text>
                  </Text>
                </View>
                <View style={styles.theftSecurityRow}>
                  <Ionicons name="lock-closed" size={16} color={COLORS.rose} />
                  <Text style={styles.theftSecurityText}>
                    Cổng Barrier: <Text style={styles.theftSecurityAlert}>TỰ ĐỘNG KHÓA CHẶT</Text>
                  </Text>
                </View>
                <View style={styles.theftSecurityRow}>
                  <Ionicons name="shield-checkmark" size={16} color={COLORS.inkSoft} />
                  <Text style={styles.theftSecurityText}>
                    Nhật ký an ninh: <Text style={styles.theftSecurityStrong}>ĐÃ GHI LẠI VÀO HỆ THỐNG</Text>
                  </Text>
                </View>
              </View>

              {/* Các nút bấm thao tác */}
              <View style={styles.theftActionCol}>
                <ScalePress
                  style={styles.theftPayBtnWrap}
                  onPress={handleTheftPayNow}
                >
                  <LinearGradient
                    colors={['#DC2626', '#B91C1C']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.theftPayBtn}
                  >
                    <Ionicons name="card-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.theftPayBtnText}>Thanh toán ngay món này</Text>
                  </LinearGradient>
                </ScalePress>

                <ScalePress
                  style={styles.theftDismissBtn}
                  onPress={() => {
                    haptic.light();
                    setTheftAlert(null);
                  }}
                >
                  <Text style={styles.theftDismissBtnText}>Đã kiểm tra / Tắt cảnh báo</Text>
                </ScalePress>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* =================================================================== */
/* Section header                                                       */
/* =================================================================== */
function SectionHeader({
  title,
  subtitle,
  count,
  tone,
}: {
  title: string;
  subtitle: string;
  count?: number;
  tone?: 'rose' | 'sage';
}) {
  const c = tone === 'rose' ? COLORS.rose : COLORS.sage;
  const soft = tone === 'rose' ? COLORS.roseSoft : COLORS.sageSoft;
  return (
    <View style={styles.sectionHead}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSub}>{subtitle}</Text>
      </View>
      {typeof count === 'number' && (
        <View style={[styles.countChip, { backgroundColor: soft }]}>
          <Text style={[styles.countChipText, { color: c }]}>{count}</Text>
        </View>
      )}
    </View>
  );
}

/* =================================================================== */
/* Product card                                                         */
/* =================================================================== */
type ProductCardProps = {
  item: Product;
  mode: 'unpaid' | 'paid';
  isEditing: boolean;
  tempUid: string;
  onChangeTempUid: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveUid: () => void;
  onPrimary: () => void;
  onSecondary: () => void;
  onDelete: () => void;
};

function ProductCard({
  item,
  mode,
  isEditing,
  tempUid,
  onChangeTempUid,
  onStartEdit,
  onCancelEdit,
  onSaveUid,
  onPrimary,
  onSecondary,
  onDelete,
}: ProductCardProps) {
  const isPaid = mode === 'paid';

  return (
    <View style={styles.card}>
      {/* Hàng trên */}
      <View style={styles.cardTop}>
        <View style={styles.cardIcon}>
          <Ionicons
            name={getCategoryIcon(item.icon || item.category || item.name)}
            size={22}
            color={COLORS.mocha}
          />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardCategory} numberOfLines={1}>
            {item.category}
          </Text>
          <View style={styles.cardPriceRow}>
            <Text style={styles.cardPrice}>{formatCurrency(item.price)}</Text>
            <View
              style={[
                styles.pill,
                {
                  backgroundColor: isPaid ? COLORS.sageSoft : COLORS.roseSoft,
                },
              ]}
            >
              <View
                style={[styles.pillDot, { backgroundColor: isPaid ? COLORS.sage : COLORS.rose }]}
              />
              <Text style={[styles.pillText, { color: isPaid ? COLORS.sage : COLORS.rose }]}>
                {isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
              </Text>
            </View>
          </View>
        </View>
        <ScalePress style={styles.cardDelete} onPress={onDelete} scaleTo={0.88} hitSlop={8}>
          <Ionicons name="trash-outline" size={15} color={COLORS.inkMuted} />
        </ScalePress>
      </View>

      {/* Dải RFID */}
      <View style={styles.rfid}>
        <View style={styles.rfidLeft}>
          <View style={styles.rfidIcon}>
            <Ionicons name="radio-outline" size={14} color={COLORS.bronze} />
          </View>
          <Text style={styles.rfidLabel} numberOfLines={1}>
            {item.tagLabel}
          </Text>
        </View>

        {isEditing ? (
          <View style={styles.rfidEdit}>
            <TextInput
              style={styles.rfidInput}
              value={tempUid}
              onChangeText={onChangeTempUid}
              placeholder="UID HEX"
              placeholderTextColor={COLORS.inkMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              onSubmitEditing={onSaveUid}
            />
            <ScalePress style={styles.rfidSave} onPress={onSaveUid} scaleTo={0.9}>
              <Ionicons name="checkmark" size={16} color={COLORS.champagne} />
            </ScalePress>
            <ScalePress style={styles.rfidCancel} onPress={onCancelEdit} scaleTo={0.9}>
              <Ionicons name="close" size={16} color={COLORS.inkSoft} />
            </ScalePress>
          </View>
        ) : (
          <Pressable
            style={styles.rfidRight}
            onPress={isPaid ? undefined : onStartEdit}
            disabled={isPaid}
            hitSlop={6}
          >
            <Text style={styles.rfidUid}>{item.tagUid}</Text>
            {!isPaid && <Ionicons name="create-outline" size={14} color={COLORS.bronze} />}
          </Pressable>
        )}
      </View>

      {/* Hành động */}
      <View style={styles.cardActions}>
        {isPaid ? (
          <>
            <ScalePress style={[styles.actionBtn, styles.actionAmber]} onPress={onPrimary}>
              <Ionicons name="arrow-undo-outline" size={15} color={COLORS.inkSoft} />
              <Text style={[styles.actionText, { color: COLORS.inkSoft }]} numberOfLines={1}>Hủy thanh toán</Text>
            </ScalePress>
            <ScalePress style={[styles.actionBtn, styles.actionSage]} onPress={onSecondary}>
              <Ionicons name="scan-outline" size={15} color={COLORS.sage} />
              <Text style={[styles.actionText, { color: COLORS.sage }]} numberOfLines={1}>Test qua cổng</Text>
            </ScalePress>
          </>
        ) : (
          <>
            <ScalePress style={[styles.actionBtn, styles.actionPrimary]} onPress={onPrimary}>
              <Ionicons name="card-outline" size={15} color="#FFFFFF" />
              <Text style={[styles.actionText, { color: '#FFFFFF' }]} numberOfLines={1}>Thanh toán</Text>
            </ScalePress>
            <ScalePress style={[styles.actionBtn, styles.actionRose]} onPress={onSecondary}>
              <Ionicons name="warning-outline" size={15} color={COLORS.rose} />
              <Text style={[styles.actionText, { color: COLORS.rose }]} numberOfLines={1}>Test vi phạm</Text>
            </ScalePress>
          </>
        )}
      </View>
    </View>
  );
}

/* =================================================================== */
/* Styles                                                               */
/* =================================================================== */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },

  /* Top bar */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    marginTop: 4,
  },
  topBarText: {
    flex: 1,
    marginRight: 12,
  },
  greeting: {
    fontSize: 13,
    color: COLORS.inkSoft,
    fontWeight: '500',
  },
  brand: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.ink,
    letterSpacing: -0.2,
    marginTop: 2,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  dateText: {
    fontSize: 12,
    color: COLORS.inkMuted,
    fontWeight: '500',
  },
  dotSep: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.lineStrong,
    marginHorizontal: 4,
  },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow(1),
  },

  /* Hero */
  hero: {
    borderRadius: RADIUS.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(226, 200, 147, 0.22)',
    overflow: 'hidden',
    ...shadow(3),
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroLabel: {
    fontSize: 12,
    color: COLORS.champagne,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  heroStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  heroStatusText: {
    fontSize: 11,
    color: '#F5EFE6',
    fontWeight: '600',
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginTop: 14,
  },
  heroSub: {
    fontSize: 12,
    color: 'rgba(245,239,230,0.7)',
    marginTop: 4,
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 16,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  heroStatValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroStatLabel: {
    fontSize: 11,
    color: 'rgba(245,239,230,0.6)',
    marginTop: 3,
  },
  heroStatSep: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  /* Environment */
  envRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  envCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...shadow(1),
  },
  envHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  envIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  envStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.inkSoft,
  },
  envValue: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.ink,
    letterSpacing: -0.5,
  },
  envUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.inkMuted,
  },
  envLabel: {
    fontSize: 12,
    color: COLORS.inkMuted,
    marginTop: 2,
    marginBottom: 10,
  },

  /* Detect banner */
  detectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.amberSoft,
    borderWidth: 1,
    borderColor: COLORS.amberLine,
    borderRadius: RADIUS.lg,
    padding: 12,
    marginTop: 14,
  },
  detectIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  detectText: {
    flex: 1,
    marginRight: 10,
  },
  detectTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.amber,
  },
  detectUid: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.ink,
    fontFamily: MONO,
    marginTop: 2,
  },
  detectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.espresso,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
  },
  detectBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Search */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 16,
    height: 48,
    marginTop: 16,
    ...shadow(1),
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.ink,
    paddingVertical: 0,
  },

  /* Section */
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.ink,
    letterSpacing: -0.3,
  },
  sectionSub: {
    fontSize: 12,
    color: COLORS.inkSoft,
    marginTop: 3,
  },
  countChip: {
    minWidth: 34,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countChipText: {
    fontSize: 13,
    fontWeight: '800',
  },

  /* Pill */
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },

  /* Product card */
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...shadow(2),
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceWarm,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
    marginRight: 8,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.ink,
    letterSpacing: -0.2,
  },
  cardCategory: {
    fontSize: 12,
    color: COLORS.inkMuted,
    marginTop: 2,
  },
  cardPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  cardPrice: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.bronze,
    letterSpacing: -0.3,
  },
  cardDelete: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceWarm,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* RFID strip */
  rfid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceWarm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderStyle: 'dashed',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 14,
    gap: 8,
  },
  rfidLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  rfidIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: COLORS.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rfidLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkSoft,
    flexShrink: 1,
  },
  rfidRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rfidUid: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
    fontFamily: MONO,
    letterSpacing: 0.5,
  },
  rfidEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    maxWidth: 210,
  },
  rfidInput: {
    flex: 1,
    height: 34,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.bronze,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 13,
    fontFamily: MONO,
    color: COLORS.ink,
    paddingVertical: 0,
  },
  rfidSave: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.espresso,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rfidCancel: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.sand,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Card actions */
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    height: 42,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 6,
  },
  actionPrimary: {
    flex: 1.3,
    backgroundColor: COLORS.primary,
  },
  actionRose: {
    flex: 1,
    backgroundColor: COLORS.roseSoft,
    borderWidth: 1,
    borderColor: COLORS.roseLine,
  },
  actionAmber: {
    flex: 1.3,
    backgroundColor: COLORS.surfaceWarm,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  actionSage: {
    flex: 1,
    backgroundColor: COLORS.sageSoft,
    borderWidth: 1,
    borderColor: COLORS.sageLine,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
  },

  /* Gate card */
  gateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...shadow(1),
  },
  gateIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  gateInfo: {
    flex: 1,
  },
  gateMsg: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.ink,
    marginTop: 6,
    lineHeight: 20,
  },
  gateMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  gateUid: {
    fontSize: 12,
    fontFamily: MONO,
    fontWeight: '700',
    color: COLORS.inkSoft,
  },
  gateTime: {
    fontSize: 11,
    color: COLORS.inkMuted,
    flexShrink: 1,
  },

  /* MQTT */
  mqttCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...shadow(1),
  },
  mqttHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  mqttHeadIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mqttTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.ink,
  },
  mqttSub: {
    fontSize: 11,
    color: COLORS.inkMuted,
    marginTop: 1,
  },
  mqttBtns: {
    flexDirection: 'row',
    gap: 12,
  },
  mqttBtn: {
    flex: 1,
    borderRadius: RADIUS.md,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mqttBtnOpen: {
    backgroundColor: COLORS.sage,
  },
  mqttBtnClose: {
    backgroundColor: COLORS.mocha,
  },
  mqttBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  /* Logs timeline */
  logHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 12,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.inkSoft,
  },
  tlRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tlRail: {
    width: 22,
    alignItems: 'center',
  },
  tlDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    borderWidth: 3,
    borderColor: COLORS.bg,
  },
  tlLine: {
    flex: 1,
    width: 2,
    backgroundColor: COLORS.lineStrong,
    marginTop: 2,
    borderRadius: 1,
  },
  tlCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  tlTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  tlStatus: {
    fontSize: 12,
    fontWeight: '800',
  },
  tlTime: {
    fontSize: 11,
    color: COLORS.inkMuted,
    flexShrink: 1,
  },
  tlProduct: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.ink,
    marginTop: 4,
  },
  tlMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  tlUid: {
    fontSize: 11,
    fontFamily: MONO,
    color: COLORS.inkSoft,
  },
  tlMsg: {
    fontSize: 12,
    color: COLORS.inkSoft,
    marginTop: 6,
    lineHeight: 17,
  },
  moreLogs: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.inkMuted,
    marginTop: 4,
  },

  /* Bottom nav cố định chuẩn mực */
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: 8,
    ...shadow(2),
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 3,
  },
  tabIconWrap: {
    width: 28,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadge: {
    position: 'absolute',
    top: -3,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.inkMuted,
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  floatingFab: {
    position: 'absolute',
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow(3),
  },

  /* Bottom sheet */
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(31, 26, 22, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '92%',
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.lineStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.ink,
    letterSpacing: -0.4,
  },
  sheetSub: {
    fontSize: 12,
    color: COLORS.inkSoft,
    marginTop: 3,
  },
  sheetClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...shadow(1),
  },
  previewIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: COLORS.sand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.ink,
  },
  previewPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.bronze,
    marginTop: 3,
  },
  previewUid: {
    backgroundColor: COLORS.surfaceWarm,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 110,
  },
  previewUidText: {
    fontSize: 11,
    fontFamily: MONO,
    fontWeight: '700',
    color: COLORS.inkSoft,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.inkSoft,
    marginTop: 16,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    height: 50,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.ink,
    paddingVertical: 0,
  },
  fieldMono: {
    fontFamily: MONO,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: COLORS.bronze,
  },
  fieldSuffix: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.inkMuted,
  },
  fieldHint: {
    fontSize: 11,
    color: COLORS.inkMuted,
    marginTop: 6,
  },
  quickFill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.amberSoft,
    borderWidth: 1,
    borderColor: COLORS.amberLine,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  quickFillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.amber,
    fontFamily: MONO,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconChoice: {
    width: '22.6%',
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconChoiceSelected: {
    borderColor: COLORS.espresso,
    backgroundColor: COLORS.espresso,
  },
  iconChoiceLabel: {
    fontSize: 11,
    color: COLORS.inkSoft,
    fontWeight: '500',
  },
  sheetBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
    marginBottom: 4,
  },
  btnGhost: {
    flex: 1,
    height: 52,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.inkSoft,
  },
  btnPrimaryWrap: {
    flex: 2,
    height: 52,
    borderRadius: RADIUS.md,
    ...shadow(2),
  },
  btnPrimary: {
    flex: 1,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Doanh thu styles */
  financeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...shadow(1),
  },
  financeHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  financeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.ink,
  },
  financePercent: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  financeBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.sand,
    overflow: 'hidden',
  },
  financeBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  financeMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  financeMetaText: {
    fontSize: 12,
    color: COLORS.inkSoft,
  },
  recentHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 10,
  },
  recentCount: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.inkMuted,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  receiptIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  receiptInfo: {
    flex: 1,
  },
  receiptName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.ink,
  },
  receiptUid: {
    fontSize: 11,
    fontFamily: MONO,
    color: COLORS.inkMuted,
    marginTop: 2,
  },
  receiptRight: {
    alignItems: 'flex-end',
  },
  receiptPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.sage,
  },
  receiptStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.inkMuted,
    marginTop: 2,
  },

  /* ============================================================= */
  /* Theft Alert Popup Styles                                      */
  /* ============================================================= */
  theftBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  theftCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#EF4444',
    ...shadow(3),
  },
  theftHeader: {
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
  },
  theftIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  theftTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  theftSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '500',
  },
  theftBody: {
    padding: 18,
    gap: 14,
  },
  theftInfoBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: RADIUS.lg,
    padding: 14,
    gap: 8,
  },
  theftInfoHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  theftProdName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#991B1B',
  },
  theftProdPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  theftMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  theftMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  theftMetaText: {
    fontSize: 12,
    fontFamily: MONO,
    color: COLORS.inkSoft,
    fontWeight: '600',
  },
  theftStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    gap: 6,
    marginTop: 2,
  },
  theftStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  theftStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.3,
  },
  theftSecurityBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: RADIUS.md,
    padding: 12,
    gap: 8,
  },
  theftSecurityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  theftSecurityText: {
    fontSize: 12,
    color: COLORS.inkSoft,
    flex: 1,
  },
  theftSecurityAlert: {
    fontWeight: '700',
    color: COLORS.rose,
  },
  theftSecurityStrong: {
    fontWeight: '700',
    color: COLORS.ink,
  },
  theftActionCol: {
    gap: 10,
    marginTop: 4,
  },
  theftPayBtnWrap: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    ...shadow(2),
  },
  theftPayBtn: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  theftPayBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  theftDismissBtn: {
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceWarm,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  theftDismissBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.inkSoft,
  },
});
