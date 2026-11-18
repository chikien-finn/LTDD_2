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

// Lấy địa chỉ IP mạng LAN của máy tính
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !name.toLowerCase().includes('vmnet')) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIp = getLocalIp();

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
  });

  // In thông tin hướng dẫn
  console.log('\n===============================================================');
  console.log('       🚀 MQTT BROKER CỦA BẠN ĐÃ KHỞI ĐỘNG THÀNH CÔNG!         ');
  console.log('===============================================================');
  console.log(`📡 Địa chỉ IP Broker của bạn:  \x1b[32m${localIp}\x1b[0m`);
  console.log(`🔌 Cổng TCP (ESP32 & MQTTX):   \x1b[36m${TCP_PORT}\x1b[0m`);
  console.log(`📱 Cổng WebSocket (App Mobile):\x1b[33m${WS_PORT}\x1b[0m (Path: /mqtt)`);
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
