# Hướng Dẫn Khắc Phục Lỗi Kết Nối & Khởi Động Expo (EventHub)

Tài liệu này lưu lại nguyên nhân và các bước sửa lỗi khi chạy dự án React Native / Expo với Expo Go.

---

## 1. Lệnh Khởi Động Hằng Ngày

Bình thường chỉ cần chạy:
```powershell
npm start
# hoặc
npx expo start
```

Nếu vừa đổi sang mạng Wi-Fi khác (ở trường, nhà, quán cafe) mà app không kết nối được, hãy xóa cache bundler:
```powershell
npx expo start -c
```

---

## 2. Lỗi "Something went wrong" / "Failed to download remote update"

### Hiện tượng:
- Điện thoại mở Expo Go quét mã QR bị treo hoặc hiện màn hình xanh báo lỗi:
  `Uncaught Error: java.io.IOException: Failed to download remote update`

### Nguyên nhân cốt lõi:
1. **Tường lửa Windows (Windows Defender Firewall) chặn Node.js**: Trong hệ thống có các luật **BLOCK** đối với `node.exe` (thường do từng bấm Cancel khi Windows hỏi cấp quyền mạng). Luật BLOCK luôn ghi đè mọi luật ALLOW.
2. **Mạng Wi-Fi bị gán là Public**: Windows chặn các thiết bị bên ngoài kết nối vào cổng 8081 khi mạng ở chế độ Public.
3. **Expo giữ IP cũ**: Khi đổi mạng Wi-Fi nhưng tiến trình cũ chưa tắt hẳn hoặc Metro còn lưu IP cũ.

### Cách khắc phục dứt điểm:
Mở **PowerShell với quyền Administrator** và chạy 3 lệnh sau:

```powershell
# 1. Xóa toàn bộ các luật CHẶN (Block) đối với Node.js
Get-NetFirewallRule | Where-Object { ($_.DisplayName -like "*Node.js*") -and ($_.Action -eq "Block") } | Remove-NetFirewallRule

# 2. Thêm luật CHO PHÉP (Allow) Node.js nhận kết nối từ mạng nội bộ
New-NetFirewallRule -DisplayName "Allow Node.js Full" -Direction Inbound -Program "C:\Program Files\nodejs\node.exe" -Action Allow

# 3. Chuyển kết nối mạng hiện tại sang chế độ Tin cậy (Private)
Get-NetConnectionProfile | Set-NetConnectionProfile -NetworkCategory Private
```

Sau đó tắt terminal cũ và chạy lại:
```powershell
npx expo start -c
```

---

## 3. Khi Mạng Wi-Fi Bị Chặn (Ký túc xá, Quán cafe, Trường học)

Nhiều mạng Wi-Fi công cộng bật tính năng **AP Isolation** (cô lập, không cho các thiết bị nói chuyện với nhau). Lúc này dùng Wi-Fi sẽ không kết nối được.

### Giải pháp tốt nhất: Dùng Cáp USB (Không cần Wi-Fi)
1. Cắm cáp sạc nối điện thoại với máy tính.
2. Trên Android: Vào **Cài đặt** > **Tùy chọn nhà phát triển** > Bật **Gỡ lỗi qua USB (USB Debugging)**.
3. Mở terminal gõ:
   ```powershell
   adb reverse tcp:8081 tcp:8081
   ```
4. Trong cửa sổ chạy `npx expo start`, nhấn phím **`a`** trên bàn phím. App sẽ tự mở thẳng trên điện thoại qua cáp với tốc độ cao nhất.

---

## 4. Lỗi ECOMPROMISED (Lock compromised) Khi Dùng npx

### Hiện tượng:
`npm error code ECOMPROMISED` - `Lock compromised`

### Cách khắc phục:
Chạy lệnh kiểm tra và dọn dẹp bộ nhớ cache của npm:
```powershell
npm cache verify
# Nếu vẫn bị thì xóa triệt để:
npm cache clean --force
```

---

## 5. Lỗi Tunnel Ngrok ("remote gone away" / "session closed")

### Hiện tượng:
Chạy `npx expo start --tunnel` bị văng sau vài giây hoặc báo lỗi session closed.

### Cách khắc phục:
Ngrok hiện yêu cầu có authtoken:
1. Đăng ký tài khoản miễn phí tại [dashboard.ngrok.com](https://dashboard.ngrok.com/signup).
2. Lấy token ở mục **Your Authtoken**.
3. Cấu hình vào máy:
   ```powershell
   npx @expo/ngrok config add-authtoken <TOKEN_CỦA_BẠN>
   ```
4. Chạy lại: `npx expo start --tunnel`.
