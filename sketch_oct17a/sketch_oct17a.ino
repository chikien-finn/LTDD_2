/**
 * ==============================================================================
 * DU AN: CUA HANG THONG MINH & CONG AN NINH IOT (ESP32)
 * Phien ban: Tu dong ket noi lai WiFi + Quet mang 2.4GHz + 100% ASCII
 * ==============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include "DHT.h"

// ---------------------- 1. CAU HINH WIFI & FIREBASE ----------------------
const char* ssid     = "Omgprice";  // Ten WiFi cua ban
const char* password = "kienpro1";  // Mat khau WiFi cua ban

const char* FIREBASE_HOST = "https://cuahangthongminhesp32-default-rtdb.asia-southeast1.firebasedatabase.app";

// ---------------------- 2. CAU HINH CHAN PHAN CUNG ----------------------
#define SS_PIN    5
#define RST_PIN   4
MFRC522 rfc(SS_PIN, RST_PIN);

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

#define BUZZER_PIN 15

#define DHTPIN 13
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// ---------------------- BIEN HE THONG ----------------------
unsigned long lastHeartbeat = 0;
unsigned long lastDhtTime = 0;
unsigned long lastWifiRetry = 0;
const unsigned long DHT_INTERVAL = 15000;
String lastScannedUid = "";
unsigned long lastScanTime = 0;

void showOledDefault();
void showOledMessage(String title, String line1, String line2, String line3);
void soundBuzzerPass();
void soundBuzzerAlert();
void soundBuzzerUnknown();
void handleCardScanned(String uid);
void sendDhtToFirebase(float temp, float hum);
void sendLogToFirebase(String productName, String uid, String status, String message);
void updateGateStatus(String status, String msg, String uid);
void connectToWiFi();

// ==============================================================================
// SETUP: KHOI TAO VA TEST
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println("");
  Serial.println("==================================================");
  Serial.println("  HE THONG CUA HANG THONG MINH IOT - ESP32        ");
  Serial.println("==================================================");
  Serial.flush();

  // 1. Test Coi Buzzer
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println("[TEST 1/5] Coi Buzzer: DA SAN SANG (GPIO 15)");
  Serial.flush();

  // 2. Test Man hinh OLED
  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[TEST 2/5] OLED: LOI KHONG TIM THAY MAN HINH (0x3C)!");
  } else {
    display.clearDisplay();
    display.setTextColor(WHITE);
    showOledMessage("SMART STORE", "TEST HE THONG...", "Khoi tao linh kien", "Xin cho giay lat");
    Serial.println("[TEST 2/5] OLED: OK! (Dia chi I2C 0x3C)");
  }
  Serial.flush();

  // 3. Test RFID RC522
  SPI.begin(18, 19, 23, 5);
  rfc.PCD_Init();
  byte v = rfc.PCD_ReadRegister(rfc.VersionReg);
  Serial.print("[TEST 3/5] Module RFID RC522: ");
  if (v == 0x00 || v == 0xFF) {
    Serial.println("CHUA NHAN! Kiem tra lai day SPI (5, 18, 19, 23, 4, 3.3V, GND)");
  } else {
    Serial.printf("OK! Chip Version: 0x%02X\n", v);
  }
  Serial.flush();

  // 4. Test Cam bien DHT
  dht.begin();
  Serial.println("[TEST 4/5] Cam bien DHT: DA KHOI DONG (GPIO 13)");
  Serial.flush();

  // 5. Ket noi WiFi
  connectToWiFi();

  delay(2000);
  showOledDefault();

  Serial.println("==================================================");
  Serial.println("  HE THONG SAN SANG! HAY QUET THE RFID...        ");
  Serial.println("==================================================\n");
  Serial.flush();
}

// ==============================================================================
// HAM KET NOI WIFI & TEST PING FIREBASE
// ==============================================================================
void connectToWiFi() {
  Serial.printf("[TEST 5/5] Dang thiet lap che do WiFi Station cho: %s\n", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  WiFi.begin(ssid, password);
  Serial.print("[WIFI] Dang ket noi");

  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 40) {
    delay(500);
    Serial.print(".");
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n >>> KET NOI WIFI: THANH CONG!");
    Serial.printf(" >>> IP ESP32: %s | Song WiFi (RSSI): %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());

    // Test ping Firebase
    Serial.println("[TEST FIREBASE] Dang doc thu tu Firebase...");
    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient https;
    https.begin(client, String(FIREBASE_HOST) + "/gate.json");
    int httpCode = https.GET();
    if (httpCode == HTTP_CODE_OK) {
      Serial.println(" >>> KET NOI FIREBASE: THANH CONG (HTTP 200 OK)!");
    } else {
      Serial.printf(" >>> CANH BAO: HTTP Code = %d\n", httpCode);
    }
    https.end();

    showOledMessage("SMART STORE", "WiFi: OK!", "Firebase: OK!", "DANG SAN SANG");
    soundBuzzerPass();
    updateGateStatus("ONLINE", "Cong an ninh san sang", "");
  } else {
    Serial.println("\n >>> CHUA KET NOI DUOC! Dang quet danh sach mang 2.4GHz xung quanh...");
    int n = WiFi.scanNetworks();
    Serial.printf(" >>> Tim thay %d mang WiFi xung quanh ESP32:\n", n);
    for (int i = 0; i < n; ++i) {
      Serial.printf("   [%d] %s (%d dBm)\n", i + 1, WiFi.SSID(i).c_str(), WiFi.RSSI(i));
    }
    showOledMessage("CANH BAO", "WiFi: CHUA NOI", "Dang thu lai...", "Kiem tra Router");
  }
}

// ==============================================================================
// LOOP: VONG LAP CHINH
// ==============================================================================
void loop() {
  // Tu dong ket noi lai WiFi neu bi mat ket noi (moi 10 giay thu lai 1 lan)
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiRetry > 10000) {
      lastWifiRetry = millis();
      Serial.println("[WIFI] Tu dong thu ket noi lai WiFi...");
      WiFi.disconnect();
      WiFi.begin(ssid, password);
    }
  }

  // In nhip tim moi 4 giay
  if (millis() - lastHeartbeat > 4000) {
    lastHeartbeat = millis();
    Serial.printf("[STATUS] ESP32 dang hoat dong | WiFi: %s | Cho quet the...\n",
      (WiFi.status() == WL_CONNECTED ? "ONLINE" : "OFFLINE")
    );
    Serial.flush();
  }

  // Doc cam bien nhiet do DHT dinh ky
  if (millis() - lastDhtTime > DHT_INTERVAL) {
    lastDhtTime = millis();
    float t = dht.readTemperature();
    float h = dht.readHumidity();

    if (!isnan(t) && !isnan(h)) {
      Serial.printf("[DHT] Nhiet do: %.1f C | Do am: %.1f %%\n", t, h);
      Serial.flush();
      if (WiFi.status() == WL_CONNECTED) {
        sendDhtToFirebase(t, h);
      }
    }
  }

  // Kiem tra the RFID
  if (!rfc.PICC_IsNewCardPresent()) {
    return;
  }
  if (!rfc.PICC_ReadCardSerial()) {
    return;
  }

  // Doc ma UID
  String uidStr = "";
  for (byte i = 0; i < rfc.uid.size; i++) {
    if (rfc.uid.uidByte[i] < 0x10) uidStr += "0";
    uidStr += String(rfc.uid.uidByte[i], HEX);
  }
  uidStr.toUpperCase();

  // Chong quet trung trong 2 giay
  if (uidStr == lastScannedUid && (millis() - lastScanTime < 2000)) {
    rfc.PICC_HaltA();
    return;
  }
  lastScannedUid = uidStr;
  lastScanTime = millis();

  Serial.println("\n--------------------------------------------------");
  Serial.print("[TEST CHIP] Phat hien the RFID! UID: ");
  Serial.println(uidStr);
  Serial.flush();

  handleCardScanned(uidStr);

  rfc.PICC_HaltA();
  delay(50);
  rfc.PCD_Init();
  Serial.println("[READY] Dau doc da lam moi, san sang cho the tiep theo.\n");
  Serial.flush();
}

// ==============================================================================
// XU LY TRA CUU DU LIEU TU FIREBASE
// ==============================================================================
void handleCardScanned(String uid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[TEST KET NOI] LOI: ESP32 chua ket noi WiFi!");
    showOledMessage("LOI HE THONG", "Khong co WiFi", "UID: " + uid, "Khong kiem tra");
    soundBuzzerAlert();
    return;
  }

  Serial.println("[TEST KET NOI] Dang gui HTTP GET tra cuu Firebase: /products.json ...");
  showOledMessage("DANG KIEM TRA", "UID: " + uid, "Tra cuu Firebase", "Dang xu ly...");

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;

  String url = String(FIREBASE_HOST) + "/products.json";
  https.begin(client, url);
  int httpCode = https.GET();

  Serial.printf("[TEST KET NOI] Ket qua HTTP Code: %d\n", httpCode);

  if (httpCode == HTTP_CODE_OK) {
    String payload = https.getString();

    DynamicJsonDocument doc(2048);
    DeserializationError error = deserializeJson(doc, payload);

    if (error) {
      Serial.println("[TEST KET QUA] LOI: Giai ma JSON that bai!");
      return;
    }

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

        Serial.println("==================================================");
        Serial.println("[TEST KET QUA] TIM THAY SAN PHAM TREN FIREBASE!");
        Serial.println(" -> Ma UID: " + uid);
        Serial.println(" -> Ten san pham: " + prodName);
        Serial.print(" -> Trang thai thanh toan: ");
        Serial.println(isPaid ? ">>> DA THANH TOAN (PAID) <<<" : ">>> CHUA THANH TOAN (UNPAID) <<<");
        Serial.println("==================================================");
        Serial.flush();

        if (isPaid) {
          Serial.println("[HANH DONG] HOP LE -> OLED: XIN CAM ON | Coi: Bip 1 tieng");
          showOledMessage("DA THANH TOAN", prodName, "XIN CAM ON!", "CHUC VUI VE!");
          soundBuzzerPass();
          sendLogToFirebase(prodName, uid, "PASS", "DA THANH TOAN - Cho phep qua cong");
          updateGateStatus("ONLINE", "Hop le: " + prodName, uid);
        } else {
          Serial.println("[HANH DONG] CANH BAO! CHUA THANH TOAN -> HU COI BAO DONG!");
          showOledMessage("! CANH BAO !", prodName, "CHUA THANH TOAN!", "BAO DONG!!!");
          sendLogToFirebase(prodName, uid, "ALERT", "CANH BAO: CHUA THANH TOAN!");
          updateGateStatus("ONLINE", "BAO DONG: " + prodName, uid);
          soundBuzzerAlert();
        }
        break;
      }
    }

    if (!found) {
      Serial.println("==================================================");
      Serial.println("[TEST KET QUA] THE CHUA DANG KY!");
      Serial.println(" -> UID: " + uid + " chua duoc gan cho san pham nao.");
      Serial.println("==================================================");
      showOledMessage("THE CHUA DANG KY", "UID: " + uid, "Chua gan do", "Vui long quet App");
      soundBuzzerUnknown();
      sendLogToFirebase("The la", uid, "ALERT", "Phat hien the la chua dang ky");
      updateGateStatus("ONLINE", "The la: " + uid, uid);
    }

  } else {
    Serial.printf("[TEST KET NOI] LOI HTTP Code: %d\n", httpCode);
    showOledMessage("LOI KET NOI", "HTTP: " + String(httpCode), "Thu lai sau", "");
  }

  https.end();
  delay(2000);
  showOledDefault();
}

// ==============================================================================
// GUI DU LIEU LEN FIREBASE
// ==============================================================================
void sendLogToFirebase(String productName, String uid, String status, String message) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;

  String url = String(FIREBASE_HOST) + "/logs.json";
  https.begin(client, url);
  https.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  doc["productName"] = productName;
  doc["tagUid"] = uid;
  doc["status"] = status;
  doc["message"] = message;
  doc["time"] = String(millis() / 1000) + "s";

  String requestBody;
  serializeJson(doc, requestBody);

  https.POST(requestBody);
  https.end();
}

void updateGateStatus(String status, String msg, String uid) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;

  String url = String(FIREBASE_HOST) + "/gate.json";
  https.begin(client, url);
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

  String url = String(FIREBASE_HOST) + "/environment.json";
  https.begin(client, url);
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
  display.println("Trang thai: SAN SANG");
  display.println("Moi quet the qua cong");
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