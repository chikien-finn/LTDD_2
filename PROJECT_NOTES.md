# PROJECT NOTES - CỬA HÀNG THÔNG MINH IOT

## 1. KHOANH VÙNG PHẠM VI DỰ ÁN (SCOPE MAPPING)
> **NGUYÊN TẮC BẮT BUỘC:** Khi user hỏi hoặc yêu cầu sửa tính năng nào, CHỈ ĐỌC đúng file trong phân vùng đó. KHÔNG quét hoặc đọc lại toàn bộ dự án.

| Phân vùng chức năng | File / Thư mục sở hữu | Nội dung quản lý |
| :--- | :--- | :--- |
| **1. Giao diện Mobile App (UI/UX)** | `App.tsx` | Quản lý 3 tab (Chưa thanh toán, Đã thanh toán, Cổng an ninh), modal sửa UID, hiển thị biểu đồ/chỉ số môi trường, giao diện nút bấm điều khiển |
| **2. Firebase Realtime Database** | `src/firebase/config.ts`<br>`src/firebase/databaseService.ts` | Khởi tạo kết nối DB, CRUD sản phẩm (`/products`), lắng nghe trạng thái cổng (`/gate`), môi trường (`/environment`), lưu log an ninh (`/logs`) |
| **3. MQTT Client trên App** | `src/mqtt/mqttService.ts` | Kết nối WebSocket tới broker (`paho-mqtt`), lắng nghe/phát sự kiện thẻ RFID, trạng thái cổng, cảm biến |
| **4. MQTT Broker nội bộ (PC)** | `broker.js` | Server Aedes: TCP port 1883 (ESP32 / MQTTX), WebSocket port 8000 (App), tự động lấy IPv4 LAN |
| **5. Firmware IoT (ESP32)** | `arduino/cuahangthongminh/cuahangthongminh.ino` | Code C++ nạp ESP32: RFID RC522, OLED SSD1306, Servo SG90, Cảm biến DHT, kết nối WiFi, gửi Firebase REST & MQTT, mDNS |
| **6. Cấu hình & Build Expo** | `package.json`<br>`app.json`<br>`metro.config.js` | Phiên bản SDK (hiện tại: Expo SDK 58, React 19.3.0, React Native 0.88.1), script chạy, cấu hình metro |

---

## 2. Kiến trúc tổng quan
- **Mobile App**: React Native + Expo (SDK 58), TypeScript.
- **Backend / Realtime**: Firebase Realtime Database + MQTT Broker nội bộ (Aedes).
- **Phần cứng**: ESP32 quẹt thẻ RFID -> check trạng thái thanh toán -> điều khiển servo barrier & OLED/còi -> gửi dữ liệu lên Firebase & MQTT.

---

## 3. Lệnh vận hành chuẩn (Phân chia cổng riêng biệt, không xung đột)
Mỗi dịch vụ đã được cố định cổng riêng trong `package.json`:
1. **MQTT Broker** (Cổng 1883 TCP + 8000 WebSocket):
   ```powershell
   npm run broker
   ```
2. **Mobile App Expo** (Cổng 8081 - qua tunnel ngrok cho điện thoại):
   ```powershell
   npm start
   ```
3. **Web App (tùy chọn)** (Cổng 8082 - xem trên trình duyệt máy tính):
   ```powershell
   npm run web
   ```

---

## 4. Tính năng cảnh báo an ninh & chống trộm (Theft Alert Modal)
- **Kích hoạt:**
  - Từ phần cứng ESP32 qua MQTT (`onRfid` khi `data.status !== 'PAID'`).
  - Từ mô phỏng trên app (`simulateGateScan` với sản phẩm chưa thanh toán).
- **Hành vi trên app:**
  - Bật Popup Modal màu đỏ toàn màn hình (viền đỏ, banner `#DC2626`, icon cảnh báo lớn).
  - Rung thiết bị liên tục (`haptic.error()`).
  - Hiển thị tên món đồ, mã UID RFID, thời gian vi phạm, tình trạng còi và cổng barrier.
  - Cung cấp nút "Thanh toán ngay món này" (để giải quyết vi phạm) và nút "Đã kiểm tra / Tắt cảnh báo".
