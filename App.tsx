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

type TabType = 'unpaid' | 'paid' | 'security';

const ICONS = ['👕', '👖', '🧥', '👗', '👟', '🧢', '🎒', '🕶️'];
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
  LayoutAnimation.configureNext(LayoutAnimation.create(240, 'easeInEaseOut', 'opacity'));

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
};

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

        setGate((prev) => ({
          ...prev,
          lastSeen: timeFormatted,
          lastScannedUid: data.uid,
          lastScannedStatus: data.status === 'PAID' ? 'PASS' : 'ALERT',
          lastMessage: `${data.product}: ${data.note || data.status}`,
        }));

        const newLogEntry: ScanLog = {
          id: 'log_' + Date.now(),
          time: timeFormatted,
          productName: data.product,
          tagUid: data.uid,
          status: data.status === 'PAID' ? 'PASS' : 'ALERT',
          message:
            data.note ||
            (data.status === 'PAID'
              ? 'Đã thanh toán - Cho phép qua'
              : 'CẢNH BÁO: Chưa thanh toán!'),
        };
        setLogs((prev) => [
          newLogEntry,
          ...prev.filter((l) => l.tagUid !== data.uid || l.time !== timeFormatted),
        ]);
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
    }
    await pushSecurityLog(logEntry);
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
            <Text style={styles.greeting}>{getGreeting()} 👋</Text>
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

        {/* ---------------- Hero card ---------------- */}
        <LinearGradient
          colors={[COLORS.mocha, COLORS.espresso]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroOrbA} />
          <View style={styles.heroOrbB} />

          <View style={styles.heroTop}>
            <View style={styles.heroLabelRow}>
              <Ionicons name="trending-up" size={14} color={COLORS.champagne} />
              <Text style={styles.heroLabel}>Doanh thu đã thanh toán</Text>
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
            {isMqttConnected ? 'MQTT đã kết nối' : 'Đồng bộ qua Firebase'}
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
              <Text style={styles.heroStatLabel}>Sản phẩm</Text>
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

        {/* ---------------- Môi trường ---------------- */}
        <View style={styles.envRow}>
          <View style={styles.envCard}>
            <View style={styles.envHead}>
              <View style={[styles.envIcon, { backgroundColor: COLORS.amberSoft }]}>
                <Ionicons name="thermometer-outline" size={18} color={COLORS.amber} />
              </View>
              <Text style={styles.envStatus}>{tempStatus}</Text>
            </View>
            <Text style={styles.envValue}>
              {temp.toFixed(1)}
              <Text style={styles.envUnit}>°C</Text>
            </Text>
            <Text style={styles.envLabel}>Nhiệt độ kho</Text>
            <ProgressBar value={clamp01(temp / 50)} color={COLORS.amber} />
          </View>

          <View style={styles.envCard}>
            <View style={styles.envHead}>
              <View style={[styles.envIcon, { backgroundColor: COLORS.tealSoft }]}>
                <Ionicons name="water-outline" size={18} color={COLORS.teal} />
              </View>
              <Text style={styles.envStatus}>{humStatus}</Text>
            </View>
            <Text style={styles.envValue}>
              {hum.toFixed(0)}
              <Text style={styles.envUnit}>%</Text>
            </Text>
            <Text style={styles.envLabel}>Độ ẩm không khí</Text>
            <ProgressBar value={clamp01(hum / 100)} color={COLORS.teal} />
          </View>
        </View>

        {/* ---------------- Banner chip mới ---------------- */}
        {hasUnknownChip && (
          <View style={styles.detectBanner}>
            <View style={styles.detectIcon}>
              <Ionicons name="sparkles" size={18} color={COLORS.amber} />
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
        {activeTab !== 'security' && (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={COLORS.inkMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm theo tên, danh mục hoặc UID..."
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
                icon={q ? 'search-outline' : 'sparkles-outline'}
                title={q ? 'Không tìm thấy sản phẩm' : 'Tất cả đã thanh toán!'}
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
              title="Cổng an ninh"
              subtitle="Dữ liệu RC522 thời gian thực qua Firebase & MQTT"
            />

            {/* Trạng thái cổng */}
            {(() => {
              const s = gate.lastScannedStatus;
              const tone =
                s === 'ALERT'
                  ? { c: COLORS.rose, soft: COLORS.roseSoft, icon: 'warning' as IconName, label: 'Cảnh báo' }
                  : s === 'PASS'
                  ? { c: COLORS.sage, soft: COLORS.sageSoft, icon: 'shield-checkmark' as IconName, label: 'Hợp lệ' }
                  : { c: COLORS.bronze, soft: COLORS.amberSoft, icon: 'scan' as IconName, label: 'Sẵn sàng' };
              return (
                <View style={styles.gateCard}>
                  <View style={[styles.gateIconRing, { borderColor: tone.soft }]}>
                    <View style={[styles.gateIcon, { backgroundColor: tone.soft }]}>
                      <Ionicons name={tone.icon} size={24} color={tone.c} />
                    </View>
                  </View>
                  <View style={styles.gateInfo}>
                    <View style={[styles.pill, { backgroundColor: tone.soft, alignSelf: 'flex-start' }]}>
                      <Text style={[styles.pillText, { color: tone.c }]}>{tone.label}</Text>
                    </View>
                    <Text style={styles.gateMsg} numberOfLines={2}>
                      {gate.lastMessage || 'Cổng an ninh sẵn sàng'}
                    </Text>
                    {Boolean(gate.lastScannedUid) && (
                      <View style={styles.gateMeta}>
                        <Ionicons name="radio-outline" size={12} color={COLORS.inkMuted} />
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
                  <Ionicons name="git-network-outline" size={18} color={COLORS.bronze} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mqttTitle}>Điều khiển Barrier</Text>
                  <Text style={styles.mqttSub}>MQTT over WebSocket • ESP32</Text>
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
                  <View style={styles.mqttBtnIcon}>
                    <Ionicons name="lock-open-outline" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={styles.mqttBtnText}>Mở cổng</Text>
                </ScalePress>
                <ScalePress style={[styles.mqttBtn, styles.mqttBtnClose]} onPress={() => sendGate('CLOSE')}>
                  <View style={styles.mqttBtnIcon}>
                    <Ionicons name="lock-closed-outline" size={20} color={COLORS.champagne} />
                  </View>
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
      </ScrollView>

      {/* ---------------- Floating bottom navigation ---------------- */}
      <View pointerEvents="box-none" style={[styles.navWrap, { bottom: navBottom }]}>
        <View style={styles.navBar}>
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <ScalePress
                key={t.key}
                onPress={() => changeTab(t.key)}
                style={[styles.navItem, active && styles.navItemActive]}
                scaleTo={0.92}
              >
                <Ionicons
                  name={active ? t.iconActive : t.icon}
                  size={20}
                  color={active ? COLORS.champagne : COLORS.inkSoft}
                />
                {active ? (
                  <Text style={styles.navLabelActive} numberOfLines={1}>
                    {t.label}
                  </Text>
                ) : t.count > 0 ? (
                  <View
                    style={[
                      styles.navBadge,
                      t.key === 'security' && { backgroundColor: COLORS.rose },
                    ]}
                  >
                    <Text style={styles.navBadgeText}>{t.count > 99 ? '99+' : t.count}</Text>
                  </View>
                ) : null}
              </ScalePress>
            );
          })}
        </View>

        <ScalePress style={styles.fab} onPress={() => openAddModal()} scaleTo={0.9}>
          <LinearGradient
            colors={[COLORS.mocha, COLORS.espresso]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabInner}
          >
            <Ionicons name="add" size={28} color={COLORS.champagne} />
          </LinearGradient>
        </ScalePress>
      </View>

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
                  <Text style={{ fontSize: 30 }}>{newIcon}</Text>
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

              <Text style={styles.fieldLabel}>Biểu tượng</Text>
              <View style={styles.iconGrid}>
                {ICONS.map((ic) => {
                  const selected = newIcon === ic;
                  return (
                    <ScalePress
                      key={ic}
                      style={[styles.iconChoice, selected && styles.iconChoiceSelected]}
                      onPress={() => {
                        haptic.light();
                        setNewIcon(ic);
                      }}
                      scaleTo={0.9}
                    >
                      <Text style={styles.iconChoiceText}>{ic}</Text>
                      {selected ? (
                        <View style={styles.iconCheck}>
                          <Ionicons name="checkmark" size={10} color={COLORS.champagne} />
                        </View>
                      ) : null}
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
          <Text style={styles.cardEmoji}>{item.icon}</Text>
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
              <Ionicons name="arrow-undo-outline" size={16} color={COLORS.amber} />
              <Text style={[styles.actionText, { color: COLORS.amber }]}>Đặt lại chưa trả</Text>
            </ScalePress>
            <ScalePress style={[styles.actionBtn, styles.actionSage]} onPress={onSecondary}>
              <Ionicons name="walk-outline" size={16} color={COLORS.sage} />
              <Text style={[styles.actionText, { color: COLORS.sage }]}>Thử qua cổng</Text>
            </ScalePress>
          </>
        ) : (
          <>
            <ScalePress style={[styles.actionBtn, styles.actionPrimary]} onPress={onPrimary}>
              <Ionicons name="card-outline" size={16} color={COLORS.champagne} />
              <Text style={[styles.actionText, { color: '#FFFFFF' }]}>Thanh toán</Text>
            </ScalePress>
            <ScalePress style={[styles.actionBtn, styles.actionRose]} onPress={onSecondary}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.rose} />
              <Text style={[styles.actionText, { color: COLORS.rose }]}>Thử trộm</Text>
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
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.ink,
    letterSpacing: -0.6,
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
    overflow: 'hidden',
    ...shadow(3),
  },
  heroOrbA: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: COLORS.champagneSoft,
    top: -110,
    right: -60,
  },
  heroOrbB: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -60,
    left: -30,
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
    borderRadius: RADIUS.pill,
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
    borderRadius: RADIUS.pill,
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
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.sand,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardEmoji: {
    fontSize: 32,
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
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    height: 46,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  actionPrimary: {
    flex: 1.3,
    backgroundColor: COLORS.espresso,
  },
  actionRose: {
    backgroundColor: COLORS.roseSoft,
    borderWidth: 1,
    borderColor: COLORS.roseLine,
  },
  actionAmber: {
    flex: 1.3,
    backgroundColor: COLORS.amberSoft,
    borderWidth: 1,
    borderColor: COLORS.amberLine,
  },
  actionSage: {
    backgroundColor: COLORS.sageSoft,
    borderWidth: 1,
    borderColor: COLORS.sageLine,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
  },

  /* Gate card */
  gateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...shadow(2),
  },
  gateIconRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  gateIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: RADIUS.xl,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...shadow(2),
  },
  mqttHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  mqttHeadIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mqttTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.ink,
  },
  mqttSub: {
    fontSize: 11,
    color: COLORS.inkMuted,
    marginTop: 2,
  },
  mqttBtns: {
    flexDirection: 'row',
    gap: 12,
  },
  mqttBtn: {
    flex: 1,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mqttBtnOpen: {
    backgroundColor: COLORS.sage,
  },
  mqttBtnClose: {
    backgroundColor: COLORS.espresso,
  },
  mqttBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
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

  /* Bottom nav */
  navWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navBar: {
    flex: 1,
    height: NAV_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: NAV_HEIGHT / 2,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: COLORS.line,
    ...shadow(3),
  },
  navItem: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  navItemActive: {
    flex: 1.9,
    backgroundColor: COLORS.espresso,
  },
  navLabelActive: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  navBadge: {
    position: 'absolute',
    top: 7,
    right: '22%',
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: COLORS.bronze,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  navBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  fab: {
    width: NAV_HEIGHT,
    height: NAV_HEIGHT,
    borderRadius: NAV_HEIGHT / 2,
    ...shadow(3),
  },
  fabInner: {
    flex: 1,
    borderRadius: NAV_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226,200,147,0.25)',
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
    aspectRatio: 1,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChoiceSelected: {
    borderColor: COLORS.espresso,
    backgroundColor: COLORS.sand,
  },
  iconChoiceText: {
    fontSize: 26,
  },
  iconCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.espresso,
    alignItems: 'center',
    justifyContent: 'center',
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
});
