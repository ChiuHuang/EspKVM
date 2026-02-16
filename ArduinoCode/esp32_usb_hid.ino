#include "USB.h"
#include "USBHIDKeyboard.h"
#include "USBHIDMouse.h"

USBHIDKeyboard Keyboard;
USBHIDMouse Mouse;

void processCommand(String cmd);

void setup() {
    Serial.begin(115200);
    Keyboard.begin();
    Mouse.begin();
    USB.begin();
}

void loop() {
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        if (cmd.length() > 0) processCommand(cmd);
    }
}

void processCommand(String cmd) {
    int i = cmd.indexOf(':');
    if (i < 0) return;
    
    String type = cmd.substring(0, i);
    String data = cmd.substring(i + 1);
    
    if (type == "M") {
        int sep = data.indexOf(':');
        if (sep > 0) {
            int8_t x = data.substring(0, sep).toInt();
            int8_t y = data.substring(sep + 1).toInt();
            Mouse.move(x, y);
        }
    } 
    else if (type == "D") {
        if (data == "L") Mouse.press(MOUSE_LEFT);
        else if (data == "R") Mouse.press(MOUSE_RIGHT);
        else if (data == "M") Mouse.press(MOUSE_MIDDLE);
    } 
    else if (type == "U") {
        if (data == "L") Mouse.release(MOUSE_LEFT);
        else if (data == "R") Mouse.release(MOUSE_RIGHT);
        else if (data == "M") Mouse.release(MOUSE_MIDDLE);
    }
    else if (type == "S") {
        Mouse.move(0, 0, data.toInt());
    }
    else if (type == "P") {
        Keyboard.press(data.toInt());
    }
    else if (type == "R") {
        Keyboard.release(data.toInt());
    }
    else if (type == "T") {
        // Sync Paste: Type out the clipboard contents
        Keyboard.print(data);
    }
    else if (type == "RST") {
        Keyboard.releaseAll();
        Mouse.release();
        delay(100);
        ESP.restart();
    }
}