import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.pixelpainter.app',
  appName: 'Pixel Painter',
  webDir: 'dist',
  android: {
    backgroundColor: '#15161c',
    // Mantém o WebView com aceleração e sem zoom nativo
    allowMixedContent: false,
  },
}

export default config
