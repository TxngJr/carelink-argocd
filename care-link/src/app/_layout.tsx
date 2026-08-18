import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/context/auth-context';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    'IBMPlexSansThaiLooped-Regular': require('@/assets/fonts/IBMPlexSansThaiLooped-Regular.ttf'),
    'IBMPlexSansThaiLooped-Medium': require('@/assets/fonts/IBMPlexSansThaiLooped-Medium.ttf'),
    'IBMPlexSansThaiLooped-SemiBold': require('@/assets/fonts/IBMPlexSansThaiLooped-SemiBold.ttf'),
    'IBMPlexSansThaiLooped-Bold': require('@/assets/fonts/IBMPlexSansThaiLooped-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Slot />
      </ThemeProvider>
    </AuthProvider>
  );
}
