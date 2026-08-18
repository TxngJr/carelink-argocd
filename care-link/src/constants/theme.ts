/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0E1F1E',
    background: '#F5F8F7',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#D4F0EB',
    textSecondary: '#667877',
  },
  dark: {
    text: '#EAFBF8',
    background: '#052523',
    backgroundElement: '#06302E',
    backgroundSelected: '#08453F',
    textSecondary: '#8A9B9A',
  },
} as const;

/**
 * AMIS DynaFlow brand palette — light, calm, clinical.
 * Deep teal primary; status colors only encode state.
 */
export const Brand = {
  primary: '#0B6B63',
  primaryHover: '#08453F',
  headerDark: '#06302E',
  headerDeep: '#052523',
  onPrimary: '#EAFBF8',
  tint: '#E9F6F4',
  tintStrong: '#D4F0EB',
  canvas: '#F5F8F7',
  surface: '#FFFFFF',
  ink: '#0E1F1E',
  secondary: '#667877',
  tertiary: '#8A9B9A',
  border: '#E1E8E7',
  borderStrong: '#BCC9C8',
  raised: '#F2F6F5',
  ok: '#1F8A5B',
  okTint: '#E4F3EC',
  warn: '#C8851A',
  warnTint: '#FAF0DC',
  warnText: '#6B4406',
  crit: '#CC3F3F',
  critTint: '#FBE7E7',
  info: '#3E6FB0',
  infoTint: '#E7EEF8',
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Bundled locally (assets/fonts/) rather than fetched from Google Fonts at
// runtime — this app needs to work reliably in a hospital hallway with
// patchy wifi. Only the regular weight is registered; RN synthesizes bold
// on top of it where the platform supports that.
export const ThaiFont = 'IBMPlexSansThaiLooped-Regular';

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
