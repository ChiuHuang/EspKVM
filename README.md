# EspKVM

EspKVM 是一個使用 React + ESP32-S3 製作的簡易 KVM 。

透過採集卡顯示目標電腦畫面，並使用 ESP32-S3 模擬 USB 鍵盤與滑鼠來控制另一台電腦。


## 架構說明

* React 前端顯示採集卡畫面
* 瀏覽器透過 Web Serial 與 ESP32-S3 通訊
* ESP32-S3 一個 USB 負責序列通訊（CH340）
* 另一個 USB 直接接到被控端電腦，模擬 HID 裝置

> [!NOTE]
> 我在這使用的是MS2130 在選擇相機時會自動對照pid vid(345f:2130)，<br>
> 如果沒有出現影像可以試著修改 [src/App.tsx](https://github.com/ChiuHuang/EspKVM/blob/main/src/App.tsx#L341)。

## 功能

* 顯示採集卡畫面（1080p60 到 4k30） *不同採集卡有不同設定
* 模擬滑鼠鍵盤操作

### Serial交流對照表 
```
M:x:y     → Mouse move
D:L       → Mouse button down
U:L       → Mouse button up
S:value   → Scroll
P:keycode → Key press
R:keycode → Key release
T:text    → Type string
RST:1234  → Restart ESP32
```
> [!TIP]
> 如果在使用中出現卡字(像是Ctrl沒有放下的情況)，`Shift` + `F12`可以重啟ESP32S3。
## 使用方式

1. 將 CH340 接到控制電腦
2. 將 ESP32-S3 原生 USB 接到被控制電腦
3. 開啟網頁
4. 點擊頁面授權 Serial
5. 點擊畫面開始控制
# 致謝
## 本作品由[yume-chan/ms2109-player](https://github.com/yume-chan/ms2109-player)進行修改。
