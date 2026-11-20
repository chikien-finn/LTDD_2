import Paho from 'paho-mqtt';

export interface MqttDhtData {
  temperature: number;
  humidity: number;
}

export interface MqttRfidData {
  uid: string;
  product: string;
  status: string;
  note?: string;
  time?: string;
}

const RTDB_URL = 'https://cuahangthongminhesp32-default-rtdb.asia-southeast1.firebasedatabase.app';
let CURRENT_BROKER_HOST = '10.153.89.35';
const BROKER_PORT = 8000; // Cổng WebSocket của Broker (Aedes)
const WS_PATH = '/mqtt';

const TOPIC_DHT = 'cua_hang_IOT/sensor/dht';
const TOPIC_RFID = 'cua_hang_IOT/rfid/scanned';
const TOPIC_GATE = 'cua_hang_IOT/gate/status';
const TOPIC_COMMAND = 'cua_hang_IOT/gate/command';

class MqttService {
  private client: Paho.Client | null = null;
  private isConnected = false;

  private onDhtCallback?: (data: MqttDhtData) => void;
  private onRfidCallback?: (data: MqttRfidData) => void;
  private onGateCallback?: (status: string) => void;
  private onConnectionChange?: (connected: boolean) => void;

  // Tự động lấy IP Broker máy tính từ Firebase (do broker.js publish lên)
  async fetchBrokerHost(): Promise<string> {
    try {
      const res = await fetch(`${RTDB_URL}/serverConfig.json`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.brokerHost) {
          CURRENT_BROKER_HOST = data.brokerHost;
          console.log('[MQTT] Tự động lấy IP Broker từ Firebase:', CURRENT_BROKER_HOST);
          return CURRENT_BROKER_HOST;
        }
      }
    } catch (e) {
      console.warn('[MQTT] Không lấy được IP từ Firebase, dùng mặc định:', CURRENT_BROKER_HOST);
    }
    return CURRENT_BROKER_HOST;
  }

  async init({
    onDht,
    onRfid,
    onGate,
    onConnectionChange,
  }: {
    onDht?: (data: MqttDhtData) => void;
    onRfid?: (data: MqttRfidData) => void;
    onGate?: (status: string) => void;
    onConnectionChange?: (connected: boolean) => void;
  }) {
    this.onDhtCallback = onDht;
    this.onRfidCallback = onRfid;
    this.onGateCallback = onGate;
    this.onConnectionChange = onConnectionChange;

    await this.fetchBrokerHost();
    this.setupClient(CURRENT_BROKER_HOST);
  }

  private setupClient(host: string) {
    if (this.client) {
      try {
        if (this.client.isConnected()) {
          this.client.disconnect();
        }
      } catch (_) {}
    }

    const clientId = 'SmartStore_App_' + Math.random().toString(16).substring(2, 8);
    this.client = new Paho.Client(host, BROKER_PORT, WS_PATH, clientId);

    this.client.onConnectionLost = (responseObject) => {
      console.log('[MQTT] Mất kết nối:', responseObject.errorMessage);
      this.isConnected = false;
      this.onConnectionChange?.(false);
      // Tự động thử kết nối lại sau 4s
      setTimeout(() => this.connect(), 4000);
    };

    this.client.onMessageArrived = (message) => {
      const topic = message.destinationName;
      const payload = message.payloadString;

      try {
        if (topic === TOPIC_DHT) {
          const data = JSON.parse(payload);
          this.onDhtCallback?.({
            temperature: Number(data.temperature ?? data.temp ?? 0),
            humidity: Number(data.humidity ?? data.hum ?? 0),
          });
        } else if (topic === TOPIC_RFID) {
          const data = JSON.parse(payload);
          this.onRfidCallback?.({
            uid: data.uid || '',
            product: data.product || '',
            status: data.status || '',
            note: data.note || data.message || '',
            time: data.time || '',
          });
        } else if (topic === TOPIC_GATE) {
          this.onGateCallback?.(payload);
        }
      } catch (err) {
        console.warn('[MQTT] Lỗi parse payload:', err);
      }
    };

    this.connect();
  }

  private connect() {
    if (!this.client || this.client.isConnected()) return;

    this.client.connect({
      useSSL: false,
      timeout: 5,
      keepAliveInterval: 30,
      cleanSession: true,
      userName: 'admin',
      password: 'admin123',
      onSuccess: () => {
        console.log('[MQTT] Kết nối HiveMQ WebSocket thành công!');
        this.isConnected = true;
        this.onConnectionChange?.(true);

        this.client?.subscribe(TOPIC_DHT, { qos: 0 });
        this.client?.subscribe(TOPIC_RFID, { qos: 0 });
        this.client?.subscribe(TOPIC_GATE, { qos: 0 });
      },
      onFailure: (err) => {
        console.log('[MQTT] Kết nối thất bại:', err.errorMessage);
        this.isConnected = false;
        this.onConnectionChange?.(false);
        // Thử refresh lại IP từ Firebase sau 5s
        setTimeout(async () => {
          const newHost = await this.fetchBrokerHost();
          if (newHost !== CURRENT_BROKER_HOST || !this.client) {
            this.setupClient(newHost);
          } else {
            this.connect();
          }
        }, 5000);
      },
    });
  }

  // Gửi lệnh điều khiển cổng xuống ESP32
  sendGateCommand(cmd: 'OPEN' | 'CLOSE') {
    if (!this.client || !this.client.isConnected()) {
      return false;
    }
    const message = new Paho.Message(cmd);
    message.destinationName = TOPIC_COMMAND;
    this.client.send(message);
    console.log('[MQTT] Đã gửi lệnh xuống ESP32:', cmd);
    return true;
  }

  disconnect() {
    if (this.client && this.client.isConnected()) {
      try {
        this.client.disconnect();
      } catch (e) {
        // ignore
      }
    }
  }
}

export const mqttService = new MqttService();
