import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Alert,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
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

type TabType = 'unpaid' | 'paid' | 'security';

export default function App() {
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

  // 3 Tab chính: Chưa thanh toán | Đã thanh toán | Cổng an ninh
  const [activeTab, setActiveTab] = useState<TabType>('unpaid');

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

  const ICONS = ['👕', '👖', '🧥', '👗', '👟', '🧢', '🎒', '🕶️'];

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

        // Bổ sung tức thì vào danh sách logs trên App với thời gian chính xác
        const newLogEntry: ScanLog = {
          id: 'log_' + Date.now(),
          time: timeFormatted,
          productName: data.product,
          tagUid: data.uid,
          status: data.status === 'PAID' ? 'PASS' : 'ALERT',
          message: data.note || (data.status === 'PAID' ? 'Đã thanh toán - Cho phép qua' : 'CẢNH BÁO: Chưa thanh toán!'),
        };
        setLogs((prev) => [newLogEntry, ...prev.filter((l) => l.tagUid !== data.uid || l.time !== timeFormatted)]);
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

  // Lọc sản phẩm theo trạng thái
  const unpaidProducts = products.filter((p) => !p.isPaid);
  const paidProducts = products.filter((p) => p.isPaid);

  // Ép đồng bộ thủ công từ Cloud
  const handleManualSync = async () => {
    setIsSyncing(true);
    const freshData = await fetchProductsDirect();
    setIsSyncing(false);
    if (freshData && freshData.length > 0) {
      setProducts(freshData);
      Alert.alert('Đã đồng bộ', 'Dữ liệu mới nhất đã được tải về từ Firebase!');
    }
  };

  // 1. THANH TOÁN SẢN PHẨM (Bay từ Chưa trả -> Đã thanh toán)
  const handlePayProduct = async (item: Product) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, isPaid: true } : p))
    );
    await updateProductPayment(item.id, true);
    Alert.alert(
      '✅ THANH TOÁN THÀNH CÔNG!',
      `Món đồ "${item.name}" đã thanh toán thành công!\n\nĐã chuyển sang mục "ĐÃ THANH TOÁN". Bạn có thể mang qua cổng an ninh hợp lệ.`
    );
  };

  // 2. TRẢ HÀNG / ĐẶT LẠI CHƯA TRẢ (Bay từ Đã thanh toán -> Chưa trả để test trộm)
  const handleRefundProduct = async (item: Product) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, isPaid: false } : p))
    );
    await updateProductPayment(item.id, false);
    Alert.alert(
      '↩️ ĐÃ ĐẶT LẠI CHƯA TRẢ!',
      `Món đồ "${item.name}" đã chuyển về mục "CHƯA THANH TOÁN".\n\nNếu bây giờ mang qua cổng an ninh, còi Buzzer sẽ hú báo động!`
    );
  };

  // 3. THÊM SẢN PHẨM MỚI (Khi mua thêm móc khóa RFID mới)
  const handleCreateProduct = async () => {
    if (!newName.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên món đồ!');
      return;
    }
    if (!newUid.trim()) {
      Alert.alert('Thiếu mã RFID', 'Vui lòng nhập mã UID của chip/móc khóa!');
      return;
    }

    const cleanUid = newUid.trim().toUpperCase().replace(/\s+/g, '');
    const newId = Date.now().toString();

    const newProd: Product = {
      id: newId,
      name: newName.trim(),
      category: 'Thời trang thông minh',
      price: parseInt(newPrice) || 200000,
      tagUid: cleanUid,
      tagLabel: newTagLabel.trim() || `Móc khóa #${products.length + 1}`,
      isPaid: false, // Mới thêm thì mặc định chưa thanh toán
      icon: newIcon,
    };

    setProducts((prev) => [...prev, newProd]);
    setShowAddModal(false);

    // Reset form
    setNewName('');
    setNewPrice('250000');
    setNewUid('');
    setNewTagLabel(`Móc khóa #${products.length + 2}`);

    await addProduct(newProd);

    Alert.alert(
      '🎉 ĐÃ THÊM MÓN ĐỒ MỚI!',
      `Tên: ${newProd.name}\nRFID UID: ${newProd.tagUid}\n\nMón này đã xuất hiện trong danh sách "CHƯA TRẢ" và sẵn sàng test với ESP32!`
    );
  };

  // 4. XÓA SẢN PHẨM
  const handleDeleteProduct = (item: Product) => {
    Alert.alert(
      'Xác nhận xóa',
      `Bạn có chắc muốn xóa "${item.name}" (UID: ${item.tagUid}) khỏi hệ thống?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa ngay',
          style: 'destructive',
          onPress: async () => {
            setProducts((prev) => prev.filter((p) => p.id !== item.id));
            await deleteProduct(item.id);
          },
        },
      ]
    );
  };

  // Lưu mã UID sửa trực tiếp
  const handleSaveUid = async (id: string) => {
    if (!tempUid.trim()) {
      setEditingId(null);
      return;
    }
    const cleanUid = tempUid.trim().toUpperCase().replace(/\s+/g, '');

    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, tagUid: cleanUid } : p))
    );

    await updateProductUid(id, cleanUid);
    setEditingId(null);
    setTempUid('');
  };

  // Giả lập quét cổng an ninh
  const simulateGateScan = async (product: Product) => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
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
    await pushSecurityLog(logEntry);

    Alert.alert(
      isSuccess ? '✅ CỔNG AN TOÀN' : '🚨 CẢNH BÁO BÁO ĐỘNG!',
      `Sản phẩm: ${product.name}\nRFID: ${product.tagUid}\nTrạng thái: ${
        isSuccess ? 'Hợp lệ (OLED hiện Cảm ơn)' : 'Chưa thanh toán (Còi Buzzer hú)'
      }`
    );
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString('vi-VN') + ' đ';
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🏪 SMART STORE</Text>
          <Text style={styles.headerSubtitle}>Cửa Hàng & Cổng An Ninh Thông Minh IoT</Text>
        </View>
        <TouchableOpacity
          style={styles.syncButton}
          onPress={handleManualSync}
          disabled={isSyncing}
        >
          <Text style={styles.syncButtonText}>{isSyncing ? '...' : '🔄 Đồng bộ'}</Text>
        </TouchableOpacity>
      </View>

      {/* Thẻ giám sát Môi trường & Cổng (DHT22 + ESP32) */}
      <View style={styles.dashboardCard}>
        <View style={styles.dashboardItem}>
          <Text style={styles.dashboardLabel}>Cổng ESP32</Text>
          <Text
            style={
              gate.status === 'ONLINE'
                ? styles.dashboardValueOnline
                : styles.dashboardValueOffline
            }
          >
            ● {gate.status === 'ONLINE' ? 'Trực tuyến' : 'Ngoại tuyến'}
          </Text>
        </View>
        <View style={styles.dividerVertical} />
        <View style={styles.dashboardItem}>
          <Text style={styles.dashboardLabel}>Nhiệt độ kho</Text>
          <Text style={styles.dashboardValue}>{environment.temperature.toFixed(1)}°C</Text>
        </View>
        <View style={styles.dividerVertical} />
        <View style={styles.dashboardItem}>
          <Text style={styles.dashboardLabel}>Độ ẩm</Text>
          <Text style={styles.dashboardValue}>{environment.humidity.toFixed(0)}%</Text>
        </View>
      </View>

      {/* BANNER THÔNG MINH: TỰ ĐỘNG PHÁT HIỆN KHI CÓ CHIP MỚI QUẸT QUA CỔNG */}
      {Boolean(gate.lastScannedUid) &&
        !products.some(
          (p) => p.tagUid.toUpperCase() === gate.lastScannedUid.toUpperCase()
        ) && (
          <View style={styles.autoDetectBanner}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.autoDetectTitle}>✨ Phát hiện chip mới vừa quẹt!</Text>
              <Text style={styles.autoDetectUid}>Mã UID: {gate.lastScannedUid}</Text>
            </View>
            <TouchableOpacity
              style={styles.autoDetectBtn}
              onPress={() => {
                setNewUid(gate.lastScannedUid);
                setNewTagLabel(`Móc khóa #${products.length + 1}`);
                setShowAddModal(true);
              }}
            >
              <Text style={styles.autoDetectBtnText}>⚡ Đăng ký ngay</Text>
            </TouchableOpacity>
          </View>
        )}

      {/* Nút THÊM SẢN PHẨM MỚI */}
      <View style={styles.addBtnContainer}>
        <TouchableOpacity
          style={styles.btnAddProduct}
          onPress={() => {
            if (gate.lastScannedUid && !products.some(p => p.tagUid.toUpperCase() === gate.lastScannedUid.toUpperCase())) {
              setNewUid(gate.lastScannedUid);
            }
            setNewTagLabel(`Móc khóa #${products.length + 1}`);
            setShowAddModal(true);
          }}
        >
          <Text style={styles.btnAddProductText}>➕ Thêm Món Đồ / Gán Chip RFID Mới</Text>
        </TouchableOpacity>
      </View>

      {/* 3 Tab chính */}
      <View style={styles.tabContainer}>
        {/* Tab 1: Chưa thanh toán */}
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'unpaid' && styles.tabButtonActiveUnpaid]}
          onPress={() => setActiveTab('unpaid')}
        >
          <Text style={[styles.tabText, activeTab === 'unpaid' && styles.tabTextActiveUnpaid]}>
            🛒 Chưa trả ({unpaidProducts.length})
          </Text>
        </TouchableOpacity>

        {/* Tab 2: Đã thanh toán */}
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'paid' && styles.tabButtonActivePaid]}
          onPress={() => setActiveTab('paid')}
        >
          <Text style={[styles.tabText, activeTab === 'paid' && styles.tabTextActivePaid]}>
            ✅ Đã trả ({paidProducts.length})
          </Text>
        </TouchableOpacity>

        {/* Tab 3: Cổng an ninh */}
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'security' && styles.tabButtonActiveSecurity]}
          onPress={() => setActiveTab('security')}
        >
          <Text style={[styles.tabText, activeTab === 'security' && styles.tabTextActiveSecurity]}>
            🛡️ Cổng & Log ({logs.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Nội dung danh sách theo Tab */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* TAB 1: SẢN PHẨM CHƯA THANH TOÁN */}
        {activeTab === 'unpaid' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Mặt hàng chưa thanh toán ({unpaidProducts.length})</Text>
              <Text style={styles.sectionSubtitle}>
                Khách mang những món này qua cổng sẽ bị còi Buzzer hú báo động!
              </Text>
            </View>

            {unpaidProducts.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🎉</Text>
                <Text style={styles.emptyTitle}>Tất cả đã thanh toán!</Text>
                <Text style={styles.emptyDesc}>
                  Không còn món đồ nào chưa trả tiền. Hãy sang tab "✅ Đã trả" để xem hoặc bấm "➕ Thêm món đồ" ở trên!
                </Text>
              </View>
            ) : (
              unpaidProducts.map((item) => (
                <View key={item.id} style={[styles.productCard, styles.productCardUnpaid]}>
                  {/* Dòng trên */}
                  <View style={styles.productTopRow}>
                    <Text style={styles.productIcon}>{item.icon}</Text>
                    <View style={styles.productInfo}>
                      <Text style={styles.productName}>{item.name}</Text>
                      <Text style={styles.productCategory}>{item.category}</Text>
                      <Text style={styles.productPrice}>{formatCurrency(item.price)}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.btnDelete}
                      onPress={() => handleDeleteProduct(item)}
                    >
                      <Text style={styles.btnDeleteText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Dòng UID RFID */}
                  <View style={styles.rfidBox}>
                    <Text style={styles.rfidLabel}>🏷️ {item.tagLabel}:</Text>
                    {editingId === item.id ? (
                      <View style={styles.editUidRow}>
                        <TextInput
                          style={styles.uidInput}
                          value={tempUid}
                          onChangeText={setTempUid}
                          placeholder="UID HEX"
                          autoCapitalize="characters"
                        />
                        <TouchableOpacity
                          style={styles.saveUidBtn}
                          onPress={() => handleSaveUid(item.id)}
                        >
                          <Text style={styles.saveUidText}>Lưu</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.uidDisplay}
                        onPress={() => {
                          setEditingId(item.id);
                          setTempUid(item.tagUid);
                        }}
                      >
                        <Text style={styles.uidText}>{item.tagUid}</Text>
                        <Text style={styles.editHint}> (Chạm sửa)</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Nút hành động */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.btnPayMain}
                      onPress={() => handlePayProduct(item)}
                    >
                      <Text style={styles.btnPayMainText}>💳 Thanh toán ngay</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnSimulateAlert}
                      onPress={() => simulateGateScan(item)}
                    >
                      <Text style={styles.btnSimulateText}>🚪 Thử trộm</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 2: SẢN PHẨM ĐÃ THANH TOÁN */}
        {activeTab === 'paid' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Mặt hàng đã thanh toán ({paidProducts.length})</Text>
              <Text style={styles.sectionSubtitle}>
                Những món này được phép qua cổng an ninh an toàn.
              </Text>
            </View>

            {paidProducts.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📦</Text>
                <Text style={styles.emptyTitle}>Chưa có món nào được trả tiền</Text>
                <Text style={styles.emptyDesc}>
                  Hãy sang tab "🛒 Chưa trả" và bấm "Thanh toán ngay" để món đồ chuyển sang đây!
                </Text>
              </View>
            ) : (
              paidProducts.map((item) => (
                <View key={item.id} style={[styles.productCard, styles.productCardPaid]}>
                  {/* Dòng trên */}
                  <View style={styles.productTopRow}>
                    <Text style={styles.productIcon}>{item.icon}</Text>
                    <View style={styles.productInfo}>
                      <Text style={styles.productName}>{item.name}</Text>
                      <Text style={styles.productCategory}>{item.category}</Text>
                      <Text style={styles.productPrice}>{formatCurrency(item.price)}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.btnDelete}
                      onPress={() => handleDeleteProduct(item)}
                    >
                      <Text style={styles.btnDeleteText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Dòng UID RFID */}
                  <View style={styles.rfidBox}>
                    <Text style={styles.rfidLabel}>🏷️ {item.tagLabel}:</Text>
                    <Text style={styles.uidText}>{item.tagUid}</Text>
                  </View>

                  {/* Nút hành động */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.btnRefundMain}
                      onPress={() => handleRefundProduct(item)}
                    >
                      <Text style={styles.btnRefundMainText}>↩️ Đặt lại: Chưa thanh toán</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnSimulatePass}
                      onPress={() => simulateGateScan(item)}
                    >
                      <Text style={styles.btnSimulateText}>🚪 Thử hợp lệ</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 3: CỔNG AN NINH & LOGS */}
        {activeTab === 'security' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Giám sát cổng an ninh ESP32</Text>
              <Text style={styles.sectionSubtitle}>
                Dữ liệu quẹt thẻ thực tế nhận từ cảm biến RC522 qua Firebase
              </Text>
            </View>

            {/* Thông tin Cổng hiện tại */}
            <View style={styles.gateStatusBox}>
              <Text style={styles.gateStatusTitle}>Trạng thái cổng:</Text>
              <Text style={styles.gateStatusMsg}>{gate.lastMessage || 'Cổng an ninh sẵn sàng'}</Text>
              {Boolean(gate.lastScannedUid) && (
                <Text style={styles.gateStatusUid}>Thẻ vừa quét: {gate.lastScannedUid}</Text>
              )}
            </View>

            {/* Hộp điều khiển & Kết nối MQTT */}
            <View style={styles.mqttControlCard}>
              <View style={styles.mqttHeaderRow}>
                <Text style={styles.mqttTitle}>⚡ Điều khiển Cổng qua MQTT</Text>
                <View
                  style={[
                    styles.mqttBadge,
                    isMqttConnected ? styles.mqttBadgeOnline : styles.mqttBadgeOffline,
                  ]}
                >
                  <Text style={styles.mqttBadgeText}>
                    {isMqttConnected ? '● MQTT ONLINE' : '○ MQTT OFFLINE'}
                  </Text>
                </View>
              </View>
              <Text style={styles.mqttSubtitle}>Broker: broker.hivemq.com (Port 8000/WS)</Text>

              <View style={styles.mqttBtnRow}>
                <TouchableOpacity
                  style={[styles.mqttBtn, styles.mqttBtnOpen]}
                  onPress={() => {
                    const sent = mqttService.sendGateCommand('OPEN');
                    if (sent) {
                      Alert.alert('Đã gửi lệnh', 'Lệnh MỞ CỔNG liên tục đã gửi qua MQTT tới ESP32!');
                    } else {
                      Alert.alert('Chưa kết nối', 'App chưa kết nối được MQTT broker.');
                    }
                  }}
                >
                  <Text style={styles.mqttBtnText}>🚪 MỞ CỔNG</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.mqttBtn, styles.mqttBtnClose]}
                  onPress={() => {
                    const sent = mqttService.sendGateCommand('CLOSE');
                    if (sent) {
                      Alert.alert('Đã gửi lệnh', 'Lệnh ĐÓNG CỔNG đã gửi qua MQTT tới ESP32!');
                    } else {
                      Alert.alert('Chưa kết nối', 'App chưa kết nối được MQTT broker.');
                    }
                  }}
                >
                  <Text style={styles.mqttBtnText}>🔒 ĐÓNG CỔNG</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 16, marginBottom: 8 }]}>
              Lịch sử quét ({logs.length})
            </Text>

            {logs.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🛡️</Text>
                <Text style={styles.emptyTitle}>Chưa có lượt quét nào</Text>
                <Text style={styles.emptyDesc}>
                  Khi bạn cầm thẻ quẹt qua đầu đọc RC522 của ESP32, nhật ký sẽ hiện ở đây!
                </Text>
              </View>
            ) : (
              logs.map((log) => (
                <View
                  key={log.id}
                  style={[
                    styles.logCard,
                    log.status === 'ALERT' ? styles.logAlert : styles.logPass,
                  ]}
                >
                  <View style={styles.logHeader}>
                    <Text style={styles.logStatus}>
                      {log.status === 'ALERT' ? '🚨 CẢNH BÁO TRỘM' : '✅ QUA CỔNG HỢP LỆ'}
                    </Text>
                    <Text style={styles.logTime}>
                      🕒 {log.time && log.time.includes('s') && !log.time.includes(':') ? `${log.time} trước` : log.time}
                    </Text>
                  </View>
                  <Text style={styles.logProduct}>{log.productName}</Text>
                  <Text style={styles.logUid}>UID RFID: {log.tagUid}</Text>
                  <Text style={styles.logMsg}>{log.message}</Text>
                </View>
              ))
            )}

            {logs.length > 0 && (
              <TouchableOpacity
                style={styles.clearLogsBtn}
                onPress={() => setLogs([])}
              >
                <Text style={styles.clearLogsText}>Xóa nhật ký hiển thị</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* MODAL THÊM SẢN PHẨM MỚI */}
      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>➕ Thêm Món Đồ / Gán Chip</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Chọn Biểu tượng */}
              <Text style={styles.inputLabel}>Chọn Biểu Tượng:</Text>
              <View style={styles.iconRow}>
                {ICONS.map((ic) => (
                  <TouchableOpacity
                    key={ic}
                    style={[styles.iconChoice, newIcon === ic && styles.iconChoiceSelected]}
                    onPress={() => setNewIcon(ic)}
                  >
                    <Text style={styles.iconChoiceText}>{ic}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tên sản phẩm */}
              <Text style={styles.inputLabel}>Tên Món Đồ:</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ví dụ: Áo Khoác Gió Nam"
                value={newName}
                onChangeText={setNewName}
              />

              {/* Giá tiền */}
              <Text style={styles.inputLabel}>Giá Tiền (VNĐ):</Text>
              <TextInput
                style={styles.formInput}
                placeholder="250000"
                keyboardType="numeric"
                value={newPrice}
                onChangeText={setNewPrice}
              />

              {/* Mã UID RFID */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 4 }}>
                <Text style={[styles.inputLabel, { marginTop: 0, marginBottom: 0 }]}>Mã UID Chip RFID:</Text>
                {Boolean(gate.lastScannedUid) && (
                  <TouchableOpacity
                    onPress={() => setNewUid(gate.lastScannedUid)}
                    style={styles.btnQuickFill}
                  >
                    <Text style={styles.btnQuickFillText}>⚡ Lấy mã vừa quẹt ({gate.lastScannedUid})</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={[styles.formInput, styles.uidFormInput]}
                placeholder="Ví dụ: A1B2C3D4"
                autoCapitalize="characters"
                value={newUid}
                onChangeText={setNewUid}
              />
              <Text style={styles.uidHelpText}>
                💡 Tự động điền khi quẹt chip vào cổng ESP32!
              </Text>

              {/* Tên nhãn móc khóa */}
              <Text style={styles.inputLabel}>Nhãn Móc Khóa:</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ví dụ: Móc khóa #3"
                value={newTagLabel}
                onChangeText={setNewTagLabel}
              />

              {/* Nút Xác Nhận */}
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={styles.btnCancel}
                  onPress={() => setShowAddModal(false)}
                >
                  <Text style={styles.btnCancelText}>Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnConfirmAdd}
                  onPress={handleCreateProduct}
                >
                  <Text style={styles.btnConfirmAddText}>Lưu Lên Hệ Thống</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  syncButton: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  syncButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3730A3',
  },
  dashboardCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  dashboardItem: {
    flex: 1,
    alignItems: 'center',
  },
  dashboardLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 4,
  },
  dashboardValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  dashboardValueOnline: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  dashboardValueOffline: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  dividerVertical: {
    width: 1,
    backgroundColor: '#E5E7EB',
    height: '80%',
    alignSelf: 'center',
  },
  addBtnContainer: {
    marginHorizontal: 16,
    marginTop: 10,
  },
  btnAddProduct: {
    backgroundColor: '#1E40AF',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#1E40AF',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  btnAddProductText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActiveUnpaid: {
    backgroundColor: '#FDE8E8',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabTextActiveUnpaid: {
    color: '#9B1C1C',
    fontWeight: '700',
  },
  tabButtonActivePaid: {
    backgroundColor: '#DEF7EC',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabTextActivePaid: {
    color: '#03543F',
    fontWeight: '700',
  },
  tabButtonActiveSecurity: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabTextActiveSecurity: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
  },
  productCardUnpaid: {
    borderColor: '#FECACA',
  },
  productCardPaid: {
    borderColor: '#A7F3D0',
  },
  productTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  productIcon: {
    fontSize: 36,
    marginRight: 12,
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  productCategory: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: 4,
  },
  btnDelete: {
    padding: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDeleteText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  rfidBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  rfidLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginRight: 6,
  },
  uidDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uidText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
    fontFamily: 'monospace',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  editHint: {
    fontSize: 11,
    color: '#3B82F6',
    fontStyle: 'italic',
  },
  editUidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flex: 1,
  },
  uidInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  saveUidBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginLeft: 6,
  },
  saveUidText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  btnPayMain: {
    flex: 2,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPayMainText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  btnRefundMain: {
    flex: 2,
    backgroundColor: '#F59E0B',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRefundMainText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  btnSimulateAlert: {
    flex: 1,
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSimulatePass: {
    flex: 1,
    backgroundColor: '#6B7280',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSimulateText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginTop: 10,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  gateStatusBox: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  gateStatusTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  gateStatusMsg: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  gateStatusUid: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#4B5563',
    marginTop: 4,
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 5,
  },
  logPass: {
    borderLeftColor: '#10B981',
  },
  logAlert: {
    borderLeftColor: '#EF4444',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  logStatus: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  logTime: {
    fontSize: 11,
    color: '#6B7280',
  },
  logProduct: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 2,
  },
  logUid: {
    fontSize: 11,
    color: '#4B5563',
    fontFamily: 'monospace',
    marginTop: 1,
  },
  logMsg: {
    fontSize: 12,
    color: '#374151',
    marginTop: 3,
    fontStyle: 'italic',
  },
  clearLogsBtn: {
    backgroundColor: '#E5E7EB',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  clearLogsText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9CA3AF',
    padding: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginTop: 10,
    marginBottom: 4,
  },
  formInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
  },
  uidFormInput: {
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#1E40AF',
  },
  uidHelpText: {
    fontSize: 11,
    color: '#2563EB',
    marginTop: 4,
    fontStyle: 'italic',
  },
  iconRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  iconChoice: {
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconChoiceSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  iconChoiceText: {
    fontSize: 22,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 10,
  },
  btnCancel: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnCancelText: {
    color: '#4B5563',
    fontWeight: '700',
    fontSize: 14,
  },
  btnConfirmAdd: {
    flex: 2,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnConfirmAddText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  autoDetectBanner: {
    backgroundColor: '#EFF6FF',
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#2563EB',
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  autoDetectTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  autoDetectUid: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1D4ED8',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  autoDetectBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  autoDetectBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  btnQuickFill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  btnQuickFillText: {
    fontSize: 11,
    color: '#3730A3',
    fontWeight: '700',
  },
  mqttControlCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  mqttHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  mqttTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  mqttSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 12,
  },
  mqttBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  mqttBadgeOnline: {
    backgroundColor: '#065F46',
  },
  mqttBadgeOffline: {
    backgroundColor: '#374151',
  },
  mqttBadgeText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
  },
  mqttBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mqttBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mqttBtnOpen: {
    backgroundColor: '#10B981',
  },
  mqttBtnClose: {
    backgroundColor: '#EF4444',
  },
  mqttBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
