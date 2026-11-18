/**
 * ==============================================================================
 * DU AN: CUA HANG THONG MINH & CONG AN NINH IOT (ESP32)
 * Phien ban: Tich hop Firebase + MQTTX (Broker HiveMQ) + Barrier Servo SG90
 * ==============================================================================
 * THU VIEN CAN CAI:
 * 1. "PubSubClient" boi Nick O'Leary
 * 2. "ESP32Servo" boi Kevin Harrington
 * 3. "ArduinoJson" (v6) boi Benoit Blanchon
 * 4. "Adafruit SSD1306" & "Adafruit GFX"
 * 5. "DHT sensor library" boi Adafruit
 * 6. "MFRC522" boi GithubCommunity
 * ==============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include "DHT.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "time.h"

// ---------------------- 1. CAU HINH WIFI & FIREBASE ----------------------
const char* ssid     = "Omgprice";  // Ten WiFi cua ban
const char* password = "kienpro2";  // Mat khau WiFi cua ban

const char* FIREBASE_HOST = "https://cuahangthongminhesp32-default-rtdb.asia-southeast1.firebasedatabase.app";

// ---------------------- 2. CAU HINH MQTT (CHO MQTTX & APP) ----------------
const char* mqtt_server = "10.95.112.35";
const int   mqtt_port   = 1883;

// Các Topic dành cho MQTTX (Trong MQTTX bạn subscribe topic: cua_hang_IOT/#)
const char* topic_dht     = "cua_hang_IOT/sensor/dht";
const char* topic_rfid    = "cua_hang_IOT/rfid/scanned";
const char* topic_gate    = "cua_hang_IOT/gate/status";
const char* topic_command = "cua_hang_IOT/gate/command";

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ---------------------- 3. CAU HINH PHAN CUNG ---------------------------
#define SS_PIN    5
#define RST_PIN   4
MFRC522 rfc(SS_PIN, RST_PIN);

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

#define BUZZER_PIN 15

#define DHTPIN 13
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// Servo SG90 (Barrier Gate)
#define SERVO_PIN 25
#define SERVO_OPEN_ANGLE  100
#define SERVO_CLOSE_ANGLE   0
Servo gateServo;

// ---------------------- BIEN HE THONG ----------------------
int currentServoPos = 0;
bool isGateOpen = false;      // Trang thai barrier: true = Mo, false = Dong
bool isGateLocked = false;    // Khoa an ninh: true = Phat hien chua thanh toan (cho lenh tu App moi mo lai)
unsigned long lastHeartbeat = 0;
unsigned long lastDhtTime = 0;
unsigned long lastWifiRetry = 0;
unsigned long lastMqttRetry = 0;
const unsigned long DHT_INTERVAL = 15000;
String lastScannedUid = "";
unsigned long lastScanTime = 0;

// Khai báo hàm
String getFormattedTime();
void showOledDefault();
void showOledMessage(String title, String line1, String line2, String line3);
void soundBuzzerPass();
void soundBuzzerAlert();
void soundBuzzerUnknown();
void handleCardScanned(String uid);
void sendDhtToFirebase(float temp, float hum);
void sendDhtToMqtt(float temp, float hum);
void sendRfidToMqtt(String uid, String prodName, String status, String note);
void sendLogToFirebase(String productName, String uid, String status, String message);
void updateGateStatus(String status, String msg, String uid);
void connectToWiFi();
void connectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void rotateServoSmooth(int targetAngle);
void openBarrierGate();
void closeBarrierGate();

// ==============================================================================
// SETUP: KHOI TAO HE THONG
// ==============================================================================
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);
  delay(1000);

  Serial.println("");
  Serial.println("==================================================");
  Serial.println("  HE THONG CUA HANG THONG MINH IOT - ESP32        ");
  Serial.println("  Ket noi MQTTX + Firebase + Barrier Gate         ");
  Serial.println("==================================================");

  // 1. Buzzer
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println("[TEST 1/6] Buzzer: OK (GPIO 15)");

  // 2. OLED
  Wire.begin(21, 22);
  if (display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    display.clearDisplay();
    display.setTextColor(WHITE);
    showOledMessage("SMART STORE", "KHOI TAO HE THONG", "Dang ket noi...", "Xin cho giay lat");
    Serial.println("[TEST 2/6] OLED: OK (0x3C)");
  }

  // 3. RFID
  SPI.begin(18, 19, 23, 5);
  rfc.PCD_Init();
  rfc.PCD_SetAntennaGain(rfc.RxGain_max); // Tối đa độ nhạy ăng-ten để bắt thẻ tốt nhất
  byte v = rfc.PCD_ReadRegister(rfc.VersionReg);
  if (v == 0x00 || v == 0xFF) {
    Serial.println("[TEST 3/6] RFID RC522: LOI! KHONG TIM THAY CHIP (0x00 / 0xFF)!");
    Serial.println("         -> Kiem tra: Day MISO (19), MOSI (23), SCK (18), SDA (5), RST (4) hoac nguon 3.3V!");
  } else {
    Serial.printf("[TEST 3/6] RFID RC522: OK! Chip Version: 0x%02X (San sang doc the)\n", v);
  }

  // 4. DHT
  dht.begin();
  Serial.println("[TEST 4/6] DHT22: OK (GPIO 13)");

  // 5. Servo SG90 (Barrier Gate)
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  gateServo.setPeriodHertz(50);
  gateServo.attach(SERVO_PIN, 500, 2400);
  gateServo.write(SERVO_CLOSE_ANGLE);
  delay(200);
  gateServo.detach(); // Ngắt xung giữ ngay để chống sụt nguồn gây Brownout!
  Serial.println("[TEST 5/6] Servo Barrier: SAN SANG (GPIO 25)");

  // 6. Cấu hình MQTT cho MQTTX
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);

  // 7. Kết nối WiFi
  connectToWiFi();

  delay(1500);
  showOledDefault();
  Serial.println("\n>>> HE THONG SAN SANG! DANG CHO QUET THE / LENH TU MQTTX <<<\n");
}

// ==============================================================================
// DIEU KHIEN SERVO SG90
// ==============================================================================
void rotateServoSmooth(int targetAngle) {
  if (targetAngle == currentServoPos) return;
  
  if (targetAngle > currentServoPos) {
    for (int pos = currentServoPos; pos <= targetAngle; pos += 2) {
      gateServo.write(pos);
      delay(15);
    }
  } else {
    for (int pos = currentServoPos; pos >= targetAngle; pos -= 2) {
      gateServo.write(pos);
      delay(15);
    }
  }
  currentServoPos = targetAngle;
}

void openBarrierGate() {
  Serial.printf("[SERVO] Mo cong barrier (%d do)\n", SERVO_OPEN_ANGLE);
  if (!gateServo.attached()) {
    gateServo.attach(SERVO_PIN, 500, 2400);
  }
  gateServo.write(SERVO_OPEN_ANGLE);
  currentServoPos = SERVO_OPEN_ANGLE;
  isGateOpen = true;
  if (mqttClient.connected()) {
    mqttClient.publish(topic_gate, "OPENED");
  }
}

void closeBarrierGate() {
  Serial.printf("[SERVO] Dong cong barrier (%d do)\n", SERVO_CLOSE_ANGLE);
  if (!gateServo.attached()) {
    gateServo.attach(SERVO_PIN, 500, 2400);
  }
  gateServo.write(SERVO_CLOSE_ANGLE);
  currentServoPos = SERVO_CLOSE_ANGLE;
  isGateOpen = false;
  delay(500); // Đợi servo quay hoàn tất về 0 độ
  gateServo.detach(); // Ngắt xung để motor không ghì gây sụt áp
  if (mqttClient.connected()) {
    mqttClient.publish(topic_gate, "CLOSED");
  }
}

// ==============================================================================
// XỬ LÝ NHẬN LỆNH TỪ MQTTX / APP (Topic: cua_hang_IOT/gate/command)
// ==============================================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  message.trim();

  Serial.printf("\n[MQTTX NHAN TIN NHAN] Topic: %s | Payload: %s\n", topic, message.c_str());

  if (String(topic) == topic_command) {
    if (message.equalsIgnoreCase("OPEN")) {
      Serial.println("[MQTT / APP] -> Lenh tu App: MO CONG BARRIER (Mo luon, mo khoa an ninh)");
      isGateLocked = false; // Mở khóa an ninh nếu trước đó bị khóa
      openBarrierGate();
      isGateOpen = true;
      showOledMessage("APP DIEU KHIEN", "MO CUA LIEN TUC", "Xin moi qua...", "");
      soundBuzzerPass();
    } else if (message.equalsIgnoreCase("CLOSE")) {
      Serial.println("[MQTT / APP] -> Lenh tu App: DONG CONG BARRIER");
      closeBarrierGate();
      isGateOpen = false;
      showOledDefault();
    }
  }
}

// ==============================================================================
// KẾT NỐI MQTT BROKER (Non-blocking: khong bao gio gay dung he thong)
// ==============================================================================
void connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqttClient.connected()) return;

  if (millis() - lastMqttRetry > 5000) {
    lastMqttRetry = millis();
    String clientId = "ESP32-SmartStore-" + String(random(0xffff), HEX);
    Serial.printf("[MQTT] Dang ket noi HiveMQ Broker (Client: %s)...\n", clientId.c_str());

    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" >>> KET NOI MQTTX BROKER: THANH CONG!");
      mqttClient.subscribe(topic_command); // Lắng nghe lệnh từ MQTTX
      mqttClient.publish(topic_gate, "ESP32_ONLINE");
    } else {
      Serial.printf(" >>> Ket noi MQTT that bai (rc=%d), se thu lai sau.\n", mqttClient.state());
    }
  }
}

// ==============================================================================
// KET NOI WIFI
// ==============================================================================
void connectToWiFi() {
  Serial.printf("[WIFI] Dang ket noi: %s\n", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 30) {
    delay(500);
    Serial.print(".");
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n >>> WIFI: DA KET NOI THANH CONG!");
    Serial.printf(" >>> IP: %s\n", WiFi.localIP().toString().c_str());

    // Dong bo gio NTP Viet Nam (GMT+7)
    configTime(7 * 3600, 0, "pool.ntp.org", "time.google.com");

    connectMQTT();

    showOledMessage("SMART STORE", "WiFi: OK!", "MQTT: OK!", "SAN SANG");
    soundBuzzerPass();
    updateGateStatus("ONLINE", "Cong an ninh san sang", "");
  } else {
    Serial.println("\n >>> WIFI: CHUA KET NOI DUOC! Kiem tra lai ten/mat khau.");
    showOledMessage("CANH BAO", "WiFi: CHUA NOI", "Kiem tra Router", "");
  }
}

// Lay thoi gian thuc he thong (Gio:Phut:Giay Ngay/Thang/Nam)
String getFormattedTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 500)) {
    return String(millis() / 1000) + "s";
  }
  char buffer[30];
  strftime(buffer, sizeof(buffer), "%H:%M:%S %d/%m/%Y", &timeinfo);
  return String(buffer);
}

// ==============================================================================
// LOOP: VONG LAP CHINH
// ==============================================================================
void loop() {
  // Tu dong noi lai WiFi neu mat ket noi
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiRetry > 10000) {
      lastWifiRetry = millis();
      WiFi.disconnect();
      WiFi.begin(ssid, password);
    }
  } else {
    // Duy trì MQTT
    if (!mqttClient.connected()) {
      connectMQTT();
    } else {
      mqttClient.loop();
    }
  }

  // Heartbeat Serial
  if (millis() - lastHeartbeat > 5000) {
    lastHeartbeat = millis();
    Serial.printf("[HEARTBEAT] WiFi: %s | MQTT: %s | Cho quet the...\n",
      (WiFi.status() == WL_CONNECTED ? "ONLINE" : "OFFLINE"),
      (mqttClient.connected() ? "CONNECTED" : "DISCONNECTED")
    );
  }

  // Doc cam bien DHT dinh ky (15s)
  if (millis() - lastDhtTime > DHT_INTERVAL) {
    lastDhtTime = millis();
    float t = dht.readTemperature();
    float h = dht.readHumidity();

    if (!isnan(t) && !isnan(h)) {
      Serial.printf("[DHT] Temp: %.1f C | Hum: %.1f %%\n", t, h);
      if (WiFi.status() == WL_CONNECTED) {
        sendDhtToFirebase(t, h);
        sendDhtToMqtt(t, h); // Ban len MQTTX
      }
    }
  }

  // Kiem tra the RFID
  if (!rfc.PICC_IsNewCardPresent()) return;
  if (!rfc.PICC_ReadCardSerial()) return;

  String uidStr = "";
  for (byte i = 0; i < rfc.uid.size; i++) {
    if (rfc.uid.uidByte[i] < 0x10) uidStr += "0";
    uidStr += String(rfc.uid.uidByte[i], HEX);
  }
  uidStr.toUpperCase();

  // Chong trung lap
  if (uidStr == lastScannedUid && (millis() - lastScanTime < 2000)) {
    rfc.PICC_HaltA();
    return;
  }
  lastScannedUid = uidStr;
  lastScanTime = millis();

  Serial.println("\n--------------------------------------------------");
  Serial.print("[RFID] Phat hien the UID: ");
  Serial.println(uidStr);

  handleCardScanned(uidStr);

  rfc.PICC_HaltA();
  delay(50);
  rfc.PCD_Init();
}

// ==============================================================================
// XU LY QUET THE
// ==============================================================================
void handleCardScanned(String uid) {
  if (WiFi.status() != WL_CONNECTED) {
    showOledMessage("LOI HE THONG", "Khong co WiFi", "UID: " + uid, "");
    soundBuzzerAlert();
    closeBarrierGate();
    return;
  }

  showOledMessage("DANG KIEM TRA", "UID: " + uid, "Tra cuu Firebase", "Xin cho...");

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;

  String url = String(FIREBASE_HOST) + "/products.json";
  https.begin(client, url);
  int httpCode = https.GET();

  if (httpCode == HTTP_CODE_OK) {
    String payload = https.getString();
    DynamicJsonDocument doc(2048);
    deserializeJson(doc, payload);

    bool found = false;
    JsonObject obj = doc.as<JsonObject>();

    for (JsonPair p : obj) {
      JsonObject prod = p.value().as<JsonObject>();
      String prodUid = prod["tagUid"].as<String>();
      prodUid.replace(" ", "");

      if (prodUid.equalsIgnoreCase(uid)) {
        found = true;
        String prodName = prod["name"].as<String>();
        bool isPaid = prod["isPaid"].as<bool>();

        Serial.println(" -> Tim thay: " + prodName + " | Thanh toan: " + (isPaid ? "DA THANH TOAN" : "CHUA THANH TOAN"));

        if (isPaid) {
          if (isGateLocked) {
            Serial.println(" -> CONG DANG KHOA AN NINH! Cho lenh tu App de mo lai!");
            showOledMessage("CONG DANG KHOA", "Cho lenh tu App", "UID: " + uid, "Chua mo duoc");
            soundBuzzerAlert();
          } else if (isGateOpen) {
            Serial.println(" -> Cua da mo san: Keu tieng bip xac nhan, KHONG xoay lai servo!");
            showOledMessage("DA THANH TOAN", prodName, "CUA DA MO SAN", "XIN MOI QUA!");
            soundBuzzerPass();
            // KHÔNG xoay servo lại

            sendLogToFirebase(prodName, uid, "PASS", "DA THANH TOAN (CUA DANG MO)");
            updateGateStatus("ONLINE", "Hop le: " + prodName + " (Cua dang mo)", uid);
            sendRfidToMqtt(uid, prodName, "PAID", "DA THANH TOAN - CHO PHEP QUA");
          } else {
            Serial.println(" -> Cua dang dong: Mo cong 3s cho khach qua roi tu dong!");
            showOledMessage("DA THANH TOAN", prodName, "XIN CAM ON!", "MO CONG BARRIER");
            soundBuzzerPass();
            openBarrierGate();

            sendLogToFirebase(prodName, uid, "PASS", "DA THANH TOAN");
            updateGateStatus("ONLINE", "Hop le: " + prodName, uid);
            sendRfidToMqtt(uid, prodName, "PAID", "DA THANH TOAN - CHO PHEP QUA");

            delay(3000);
            closeBarrierGate();
            showOledDefault();
          }
        } else {
          // CHƯA THANH TOÁN -> ĐÓNG CỬA VÀ KHÓA, CHỜ LỆNH TỪ APP!
          Serial.println(" -> CANH BAO: CHUA THANH TOAN! DONG CUA VA KHOA CONG, CHO LENH TU APP!");
          closeBarrierGate();
          isGateLocked = true; // KHÓA CỔNG

          showOledMessage("! CANH BAO !", prodName, "CHUA THANH TOAN!", "DA KHOA CONG!");
          soundBuzzerAlert();

          sendLogToFirebase(prodName, uid, "ALERT", "CANH BAO: CHUA THANH TOAN! DA KHOA CONG");
          updateGateStatus("ONLINE", "BAO DONG: " + prodName + " (KHOA CONG)", uid);
          sendRfidToMqtt(uid, prodName, "ALERT", "CANH BAO: CHUA THANH TOAN! KHOA CONG");
        }
        break;
      }
    }

    if (!found) {
      Serial.println(" -> THE LA CHUA DANG KY! DONG CUA VA KHOA CONG, CHO LENH TU APP!");
      closeBarrierGate();
      isGateLocked = true; // KHÓA CỔNG
      showOledMessage("THE CHUA DANG KY", "UID: " + uid, "Chua gan do", "DA KHOA CONG!");
      soundBuzzerUnknown();

      sendLogToFirebase("The la", uid, "ALERT", "The chua dang ky! DA KHOA CONG");
      updateGateStatus("ONLINE", "The la: " + uid + " (KHOA CONG)", uid);
      sendRfidToMqtt(uid, "The la", "UNKNOWN", "THE CHUA DANG KY - KHOA CONG");
    }
  } else {
    showOledMessage("LOI KET NOI", "HTTP Code: " + String(httpCode), "Thu lai sau", "");
    closeBarrierGate();
  }

  https.end();
  delay(1500);
  showOledDefault();
}

// ==============================================================================
// GỬI DỮ LIỆU LÊN MQTTX
// ==============================================================================
void sendDhtToMqtt(float temp, float hum) {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<128> doc;
  doc["temperature"] = temp;
  doc["humidity"] = hum;

  char buffer[128];
  serializeJson(doc, buffer);
  mqttClient.publish(topic_dht, buffer);
  Serial.println("[MQTTX] -> Da ban DHT vao " + String(topic_dht));
}

void sendRfidToMqtt(String uid, String prodName, String status, String note) {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<256> doc;
  doc["uid"] = uid;
  doc["product"] = prodName;
  doc["status"] = status;
  doc["note"] = note;
  doc["time"] = getFormattedTime();

  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(topic_rfid, buffer);
  Serial.println("[MQTTX] -> Da ban RFID vao " + String(topic_rfid));
}

// ==============================================================================
// GỬI DỮ LIỆU LÊN FIREBASE
// ==============================================================================
void sendLogToFirebase(String productName, String uid, String status, String message) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;
  https.begin(client, String(FIREBASE_HOST) + "/logs.json");
  https.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  doc["productName"] = productName;
  doc["tagUid"] = uid;
  doc["status"] = status;
  doc["message"] = message;
  doc["time"] = getFormattedTime();

  String requestBody;
  serializeJson(doc, requestBody);
  https.POST(requestBody);
  https.end();
}

void updateGateStatus(String status, String msg, String uid) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;
  https.begin(client, String(FIREBASE_HOST) + "/gate.json");
  https.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  doc["status"] = status;
  doc["lastMessage"] = msg;
  doc["lastScannedUid"] = uid;
  doc["lastScannedStatus"] = (msg.indexOf("BAO DONG") >= 0) ? "ALERT" : "PASS";

  String requestBody;
  serializeJson(doc, requestBody);
  https.PATCH(requestBody);
  https.end();
}

void sendDhtToFirebase(float temp, float hum) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;
  https.begin(client, String(FIREBASE_HOST) + "/environment.json");
  https.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> doc;
  doc["temperature"] = temp;
  doc["humidity"] = hum;
  doc["lastUpdated"] = "Vua cap nhat";

  String requestBody;
  serializeJson(doc, requestBody);
  https.PUT(requestBody);
  https.end();
}

// ==============================================================================
// OLED
// ==============================================================================
void showOledDefault() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("--- SMART STORE ---");
  display.println("");
  display.println("CONG AN NINH IOT");
  if (isGateLocked) {
    display.println("Trang thai: KHOA (CHO APP)");
    display.println("Barrier: DANG KHOA DONG");
  } else if (isGateOpen) {
    display.println("Trang thai: MO SAN SANG");
    display.println("Barrier: DANG MO");
  } else {
    display.println("Trang thai: SAN SANG");
    display.println("Barrier: DANG DONG");
  }
  display.display();
}

void showOledMessage(String title, String line1, String line2, String line3) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("[" + title + "]");
  display.println("--------------------");
  display.println(line1);
  display.println(line2);
  display.println(line3);
  display.display();
}

// ==============================================================================
// COI BUZZER
// ==============================================================================
void soundBuzzerPass() {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(120);
  digitalWrite(BUZZER_PIN, LOW);
}

void soundBuzzerAlert() {
  for (int i = 0; i < 5; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(150);
    digitalWrite(BUZZER_PIN, LOW);
    delay(100);
  }
}

void soundBuzzerUnknown() {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(80);
  digitalWrite(BUZZER_PIN, LOW);
  delay(80);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(80);
  digitalWrite(BUZZER_PIN, LOW);
}