import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './App.module.css';

interface SerialConnection {
  port: any;
  reader: any;
  writer: any;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MODE_LIST = [
  { width: 1280, height: 720, frameRate: 60 },
  { width: 1920, height: 1080, frameRate: 60 },
  { width: 3840, height: 2160, frameRate: 30 },
  {video: true}
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function findDevice(devices: MediaDeviceInfo[], type: 'videoinput' | 'audioinput', vid: string, pid: string): MediaDeviceInfo | undefined {
  return devices.find(
    x =>
      x.kind === type &&
      x.label.endsWith(`(${vid.toLowerCase()}:${pid.toLowerCase()})`)
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function requestMediaDevicePermission() {
  const stream = await window.navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });

  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function App() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sensitivity] = useState(0.4); // 0.5 = 50% speed
  const serialConnection = useRef<SerialConnection | null>(null);
  const keysPressed = useRef<Set<number>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const videoRef = useRef<HTMLVideoElement>(null);
  const commandQueue = useRef<string[]>([]);
  const isSending = useRef(false);
  const hasInitiated = useRef(false);
  const lastMouseMove = useRef(0);
  const pendingMouseX = useRef(0);
  const pendingMouseY = useRef(0);
  const mouseThrottleTimer = useRef<NodeJS.Timeout | null>(null);

  // Send queued commands via serial
  const processQueue = useCallback(async () => {
    if (isSending.current || commandQueue.current.length === 0) return;
    
    isSending.current = true;
    const command = commandQueue.current.shift();
    
    if (command && serialConnection.current?.writer) {
      try {
        console.log('Sending command:', command);
        // Send as string for TextEncoderStream, or as Uint8Array for direct writer
        const msg = command + '\n';
        if (serialConnection.current.writer.write) {
          // Check if it's a TextEncoderStream writer (writes strings)
          try {
            await serialConnection.current.writer.write(msg);
          } catch {
            // Fallback: treat as direct writer (writes Uint8Array)
            const encoder = new TextEncoder();
            await serialConnection.current.writer.write(encoder.encode(msg));
          }
        }
        console.log('Command sent successfully');
      } catch (error) {
        console.error('Failed to send command:', error);
      }
    }
    
    isSending.current = false;
    
    // Process next command with no delay for serial
    if (commandQueue.current.length > 0) {
      processQueue();
    }
  }, []);

  // Queue command
  const sendCommand = useCallback((command: string) => {
    commandQueue.current.push(command);
    if (!isSending.current) {
      processQueue();
    }
  }, [processQueue]);


  // Connect to Serial ESP32
  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      // Check if Web Serial API is available
      if (!(navigator as any).serial) {
        throw new Error('Web Serial API not available. Use Chrome/Edge on desktop.');
      }
      
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });
      
      try {
        // Try modern approach with TextEncoderStream
        const textEncoder = new TextEncoderStream();
        textEncoder.readable.pipeTo(port.writable).catch(() => {});
        const writer = textEncoder.writable.getWriter();
        
        serialConnection.current = { port, reader: null, writer };
      } catch (e) {
        // Fallback: use direct write
        const writer = port.writable.getWriter();
        serialConnection.current = { port, reader: null, writer };
      }
      
      setConnected(true);
      console.log('Serial connected');
      setConnecting(false);
      
      
    } catch (error) {
      console.error('Connection error:', error);
      setConnecting(false);
    }
  }, []);

  // Auto-connect on first user gesture (but only via click to ensure user gesture)
  useEffect(() => {
    if (connecting || connected || hasInitiated.current) return;

    const initiateConnection = () => {
      if (!hasInitiated.current) {
        hasInitiated.current = true;
        handleConnect();
      }
    };

    // Only on click for Web Serial (requires direct user gesture)
    window.addEventListener('click', initiateConnection, { once: true });

    return () => {
      window.removeEventListener('click', initiateConnection);
    };
  }, [handleConnect, connecting, connected]);

  // Lock pointer to video element
  useEffect(() => {
    const videoEle = videoRef.current;

    if (!connected || !videoEle) return;

    const lockPointer = async () => {
      if (videoEle) {
        try {
          await videoEle.requestPointerLock();
        } catch (error) {
          console.error('Pointer lock failed:', error);
        }
      }
    };

    // Lock on click
    videoEle.addEventListener('click', lockPointer);

    // Unlock on ESC key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.exitPointerLock?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      if (videoEle) {
        videoEle.removeEventListener('click', lockPointer);
      }
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [connected]);

  // Handle mouse move with throttling
  useEffect(() => {
    if (!connected) return;

    const handleMouseMove = (e: MouseEvent) => {
      let x = Math.max(-127, Math.min(127, Math.round(e.movementX * sensitivity)));
      let y = Math.max(-127, Math.min(127, Math.round(e.movementY * sensitivity)));
      
      if (x !== 0 || y !== 0) {
        // Accumulate movement
        pendingMouseX.current += x;
        pendingMouseY.current += y;
        
        // Throttle to 10ms for serial (send ~100 times per second max)
        const now = Date.now();
        if (now - lastMouseMove.current >= 10) {
          lastMouseMove.current = now;
          
          // Send accumulated movement immediately
          sendCommand(`M:${pendingMouseX.current}:${pendingMouseY.current}`);
          pendingMouseX.current = 0;
          pendingMouseY.current = 0;
          
          // Clear any pending timer
          if (mouseThrottleTimer.current) {
            clearTimeout(mouseThrottleTimer.current);
            mouseThrottleTimer.current = null;
          }
        } else if (!mouseThrottleTimer.current) {
          // Schedule a send for accumulated movement
          mouseThrottleTimer.current = setTimeout(() => {
            if (pendingMouseX.current !== 0 || pendingMouseY.current !== 0) {
              lastMouseMove.current = Date.now();
              sendCommand(`M:${pendingMouseX.current}:${pendingMouseY.current}`);
              pendingMouseX.current = 0;
              pendingMouseY.current = 0;
            }
            mouseThrottleTimer.current = null;
          }, 10 - (now - lastMouseMove.current));
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (mouseThrottleTimer.current) {
        clearTimeout(mouseThrottleTimer.current);
      }
    };
  }, [connected, sendCommand, sensitivity]);

  // Handle mouse clicks
  useEffect(() => {
    if (!connected) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) sendCommand('D:L');
      else if (e.button === 2) sendCommand('D:R');
      else if (e.button === 1) sendCommand('D:M');
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) sendCommand('U:L');
      else if (e.button === 2) sendCommand('U:R');
      else if (e.button === 1) sendCommand('U:M');
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [connected, sendCommand]);

  // Handle mouse wheel
  useEffect(() => {
    if (!connected) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scroll = Math.max(-127, Math.min(127, Math.round(-e.deltaY / 10)));
      if (scroll !== 0) {
        sendCommand(`S:${scroll}`);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [connected, sendCommand]);

  // Handle keyboard with modifier support for shortcuts
  useEffect(() => {
    if (!connected) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const keyCode = e.keyCode;
      
      // Handle modifiers first
      const modifiers = [];
      if (e.ctrlKey && keyCode !== 17) modifiers.push(128); // KEY_LEFT_CTRL
      if (e.shiftKey && keyCode !== 16) modifiers.push(129); // KEY_LEFT_SHIFT
      if (e.altKey && keyCode !== 18) modifiers.push(130); // KEY_LEFT_ALT
      if (e.metaKey && keyCode !== 91 && keyCode !== 93) modifiers.push(131); // KEY_LEFT_GUI (Windows/Cmd)
      if (e.shiftKey && e.key === 'F12') {
          e.preventDefault();
          sendCommand('RST:1234');
          return;
      }   
      
      if (e.shiftKey && e.altKey && e.key === 'F10') {
          e.preventDefault();
          sendCommand('P:81'); // powerdown
          return;
      }
      if (e.shiftKey && e.altKey && e.key === 'F11') {
          e.preventDefault();
          sendCommand('P:83'); // Direct HID Code: Generic Desktop System Wake Up
          return;
      }

      if (modifiers.length > 0 && keyCode > 31 && keyCode < 127) {
        e.preventDefault(); // Prevent browser shortcuts
        
        // Press modifiers
        modifiers.forEach(mod => sendCommand(`P:${mod}`));
        
        // Press the key
        if (!keysPressed.current.has(keyCode)) {
          keysPressed.current.add(keyCode);
          sendCommand(`P:${keyCode}`);
        }
      } else {
        // Regular key press
        if (!keysPressed.current.has(keyCode)) {
          keysPressed.current.add(keyCode);
          sendCommand(`P:${keyCode}`);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const keyCode = e.keyCode;
      keysPressed.current.delete(keyCode);
      sendCommand(`R:${keyCode}`);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [connected, sendCommand]);

  // Initialize video capture
  useEffect(() => {
    const initVideo = async () => {
      if (!videoRef.current) return;

      try {
        await requestMediaDevicePermission();
        const devices = await window.navigator.mediaDevices.enumerateDevices();
        const videoDevice = findDevice(devices, 'videoinput', '345f', '2130');

        if (!videoDevice) {
          console.error('MS2109 video device not found');
          return;
        }

        for (const mode of MODE_LIST) {
          try {
            const videoStream = await window.navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: videoDevice.deviceId },
                width: { exact: mode.width },
                height: { exact: mode.height },
                frameRate: { exact: mode.frameRate },
              },
            });
            videoRef.current.srcObject = videoStream;
            break;
          } catch (e) {
            console.error(`Mode ${mode.width}x${mode.height}@${mode.frameRate}fps failed:`, e);
          }
        }
      } catch (error) {
        console.error('Failed to initialize video:', error);
      }
    };

    initVideo();
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      <video ref={videoRef} className={styles.video} autoPlay playsInline />
      

    </div>
  );
}

export default App;
