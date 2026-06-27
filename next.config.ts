import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow our LAN-IP origin so phones on the same WiFi can reach dev cleanly.
  // This silences the "cross-origin request" warning for the Android WebView.
  allowedDevOrigins: ["http://192.168.1.69:3000", "192.168.1.69"],
};

export default nextConfig;
 