/**
 * ==============================================================================
 * MQTT BROKER RIÊNG CHO DỰ ÁN CỬA HÀNG THÔNG MINH IOT
 * Chạy trên Node.js (Aedes v1.2+) - Hỗ trợ TCP (ESP32, MQTTX) và WebSocket (App)
 * ==============================================================================
 */

const { Aedes } = require('aedes');
const net = require('net');
const http = require('http');
const ws = require('ws');
const os = require('os');

const TCP_PORT = 1883;       // Cổng TCP cho ESP32 và MQTTX
const WS_PORT = 8000;        // Cổng WebSocket cho App di động (React Native / Expo)
const FIREBASE_REST_URL = 'https://cuahangthongminhesp32-default-rtdb.asia-southeast1.firebasedatabase.app';

// Lấy địa chỉ IP mạng LAN của máy tính (ưu tiên card Wi-Fi / WLAN)
function getLocalIp() {
  const nets = os.networkInterfaces();

  // 1. Ưu tiên tìm card Wi-Fi / WLAN thật
  for (const name of Object.keys(nets)) {
    const lower = name.toLowerCase();
    if (lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('wlan')) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
          return net.address;
        }
      }
    }
  }

  // 2. Tìm card mạng vật lý khác (loại trừ adapter ảo VMware, VirtualBox, WSL, vEthernet, APIPA)
  for (const name of Object.keys(nets)) {
    const lower = name.toLowerCase();
    if (!lower.includes('vmnet') && !lower.includes('virtual') && !lower.includes('vethernet') && !lower.includes('wsl')) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
          return net.address;
        }
      }
    }
  }

  return '127.0.0.1';
}

const localIp = getLocalIp();

// Đồng bộ IP Broker lên Firebase để App Mobile tự động kết nối
async function syncIpToFirebase(ip) {
  try {
    const res = await fetch(`${FIREBASE_REST_URL}/serverConfig.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brokerHost: ip,
        wsPort: WS_PORT,
        updatedAt: new Date().toISOString(),
      }),
    });
    if (res.ok) {
      console.log(`☁️  [Firebase] Đã tự động cập nhật IP Broker (${ip}) lên Cloud cho Mobile App!`);
    }
  } catch (err) {
    // Không làm gián đoạn broker nếu mất kết nối
  }
}

async function startBroker() {
  // Khởi tạo Broker bằng Aedes factory chuẩn (khởi tạo đủ persistence store)
  const aedes = await Aedes.createBroker();

  // 1. Khởi tạo TCP Server (Cổng 1883 cho ESP32, MQTTX)
  const tcpServer = net.createServer(aedes.handle);
  tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
    // TCP Ready
  });

  // 2. Khởi tạo WebSocket Server (Cổng 8000 cho Mobile App)
  const httpServer = http.createServer();
  const wss = new ws.Server({ server: httpServer });

  wss.on('connection', (conn) => {
    const stream = ws.createWebSocketStream(conn);
    aedes.handle(stream);
  });

  httpServer.listen(WS_PORT, '0.0.0.0', () => {
    // WS Ready
    syncIpToFirebase(localIp);
  });

  // ==============================================================================
  // 1. TÍNH NĂNG BẢO MẬT: XÁC THỰC NGƯỜI DÙNG (AUTHENTICATION)
  // ==============================================================================
  aedes.authenticate = (client, username, password, callback) => {
    const user = username ? username.toString().trim() : '';
    const pass = password ? password.toString().trim() : '';

    // Tài khoản ADMIN: Dành cho Mobile App & MQTTX Quản trị (Toàn quyền hệ thống)
    if (user === 'admin' && pass === 'admin123') {
      client.role = 'ADMIN';
      console.log(`🔒 \x1b[32m[XÁC THỰC THÀNH CÔNG]\x1b[0m Client [${client.id}] đăng nhập quyền: \x1b[33mADMIN\x1b[0m`);
      return callback(null, true);
    }

    // Tài khoản DEVICE: Dành riêng cho mạch ESP32
    if (user === 'esp32' && pass === 'esp32pass') {
      client.role = 'DEVICE';
      console.log(`🔒 \x1b[32m[XÁC THỰC THÀNH CÔNG]\x1b[0m Client [${client.id}] đăng nhập quyền: \x1b[36mDEVICE (ESP32)\x1b[0m`);
      return callback(null, true);
    }

    // Chế độ KHÁCH (GUEST): Nếu không nhập user/pass (cho phép xem dữ liệu công khai, không được điều khiển)
    if (!user && !pass) {
      client.role = 'GUEST';
      console.log(`👤 \x1b[33m[KẾT NỐI KHÁCH]\x1b[0m Client [${client.id}] kết nối ẩn danh quyền: \x1b[37mGUEST (Chỉ xem)\x1b[0m`);
      return callback(null, true);
    }

    // Nhập sai tài khoản / mật khẩu -> Từ chối kết nối
    console.log(`⛔ \x1b[31m[XÁC THỰC THẤT BẠI]\x1b[0m Client [${client.id}] nhập sai User/Pass ('${user}' / '***') -> BỊ TỪ CHỐI!`);
    const error = new Error('Auth error: Sai tên đăng nhập hoặc mật khẩu!');
    error.returnCode = 4; // 4 = Bad username or password
    return callback(error, false);
  };

  // ==============================================================================
  // 2. TÍNH NĂNG PHÂN QUYỀN GỬI TIN NHẮN (AUTHORIZE PUBLISH)
  // ==============================================================================
  aedes.authorizePublish = (client, packet, callback) => {
    if (!client) return callback(null); // Tin nhắn nội bộ Broker

    const topic = packet.topic;
    if (topic.startsWith('$SYS')) return callback(null);

    const role = client.role || 'GUEST';

    // Phân quyền 1: Chỉ ADMIN mới được phép gửi lệnh mở/đóng cổng barrier
    if (topic === 'cua_hang_IOT/gate/command') {
      if (role === 'ADMIN') {
        return callback(null); // Cho phép
      }
      console.log(`🚫 \x1b[31m[TỪ CHỐI PHÂN QUYỀN]\x1b[0m Client [${client.id}] (Role: ${role}) KHÔNG ĐƯỢC PHÉP gửi lệnh vào topic nhạy cảm: \x1b[33m${topic}\x1b[0m`);
      return callback(new Error('Permission Denied: Chỉ ADMIN mới có quyền điều khiển cổng!'));
    }

    // Phân quyền 2: Khách (GUEST) chỉ được xem, không được mạo danh gửi dữ liệu cảm biến / RFID
    if (role === 'GUEST' && (topic.startsWith('cua_hang_IOT/sensor') || topic.startsWith('cua_hang_IOT/rfid'))) {
      console.log(`🚫 \x1b[31m[TỪ CHỐI PHÂN QUYỀN]\x1b[0m Khách [${client.id}] KHÔNG ĐƯỢC PHÉP gửi dữ liệu vào topic: \x1b[33m${topic}\x1b[0m`);
      return callback(new Error('Permission Denied: Khách chỉ có quyền đọc!'));
    }

    // Các trường hợp hợp lệ khác -> Cho phép gửi
    callback(null);
  };

  // ==============================================================================
  // 3. TÍNH NĂNG PHÂN QUYỀN NHẬN TIN NHẮN (AUTHORIZE SUBSCRIBE)
  // ==============================================================================
  aedes.authorizeSubscribe = (client, sub, callback) => {
    // Tất cả các role (ADMIN, DEVICE, GUEST) đều được phép subscribe theo dõi thông số
    callback(null, sub);
  };

  // In thông tin hướng dẫn
  console.log('\n===============================================================');
  console.log('       🚀 MQTT BROKER CỦA BẠN ĐÃ KHỞI ĐỘNG THÀNH CÔNG!         ');
  console.log('===============================================================');
  console.log(`📡 Địa chỉ IP Broker của bạn:  \x1b[32m${localIp}\x1b[0m`);
  console.log(`🔌 Cổng TCP (ESP32 & MQTTX):   \x1b[36m${TCP_PORT}\x1b[0m`);
  console.log(`📱 Cổng WebSocket (App Mobile):\x1b[33m${WS_PORT}\x1b[0m (Path: /mqtt)`);
  console.log('---------------------------------------------------------------');
  console.log('🔐 BẢO MẬT & PHÂN QUYỀN (RBAC):');
  console.log('   - ADMIN  (App/MQTTX): User: \x1b[33madmin\x1b[0m | Pass: \x1b[33madmin123\x1b[0m -> Toàn quyền (Pub/Sub)');
  console.log('   - DEVICE (ESP32):     User: \x1b[36mesp32\x1b[0m | Pass: \x1b[36mesp32pass\x1b[0m -> Gửi cảm biến & RFID');
  console.log('   - GUEST  (Ẩn danh):   Không cần User/Pass -> Chỉ được xem (Read-only)');
  console.log('---------------------------------------------------------------');
  console.log('👉 Hướng dẫn kết nối:');
  console.log(`   - Trong MQTTX:        Host: ${localIp} | Port: ${TCP_PORT} | Version: 3.1.1`);
  console.log(`   - Trong ESP32 code:   mqtt_server = "${localIp}"; Port: ${TCP_PORT};`);
  console.log(`   - Trong Mobile App:   BROKER_HOST = '${localIp}'; Port: ${WS_PORT};`);
  console.log('===============================================================\n');
  console.log('⏳ Đang sẵn sàng nhận kết nối...\n');

  // Sự kiện: Khi có thiết bị kết nối vào Broker
  aedes.on('client', (client) => {
    console.log(`[\x1b[32mKẾT NỐI MỚI\x1b[0m] Thiết bị ID: \x1b[32m${client.id}\x1b[0m đã tham gia vào Broker!`);
  });

  // Sự kiện: Khi thiết bị ngắt kết nối
  aedes.on('clientDisconnect', (client) => {
    console.log(`[\x1b[31mNGẮT KẾT NỐI\x1b[0m] Thiết bị ID: \x1b[31m${client.id}\x1b[0m đã rời Broker.`);
  });

  // Bắt lỗi kết nối để không bị crash
  aedes.on('clientError', (client, err) => {
    console.log(`[\x1b[31mLỖI CLIENT\x1b[0m] [${client ? client.id : 'Unknown'}]: ${err.message}`);
  });

  aedes.on('connectionError', (client, err) => {
    console.log(`[\x1b[31mLỖI KẾT NỐI\x1b[0m] ${err.message}`);
  });

  // Sự kiện: Khi thiết bị đăng ký topic (Subscribe)
  aedes.on('subscribe', (subscriptions, client) => {
    if (client) {
      const topics = subscriptions.map((s) => s.topic).join(', ');
      console.log(`[\x1b[34mSUBSCRIBE\x1b[0m] [${client.id}] vừa đăng ký theo dõi: \x1b[36m${topics}\x1b[0m`);
    }
  });

  // Sự kiện: Khi có tin nhắn được gửi (Publish)
  aedes.on('publish', (packet, client) => {
    if (client) {
      const topic = packet.topic;
      if (!topic.startsWith('$SYS')) {
        const payload = packet.payload.toString();
        console.log(`[\x1b[35mPUBLISH\x1b[0m] [${client.id}] -> Topic: \x1b[33m${topic}\x1b[0m | Dữ liệu: ${payload}`);
      }
    }
  });
}

startBroker().catch((err) => {
  console.error('Lỗi khởi động Broker:', err);
});
