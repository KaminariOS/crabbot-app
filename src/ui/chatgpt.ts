import type { ResolvedTheme } from '@/src/state/ThemeContext';

export type ChatGptPalette = {
  appBg: string;
  headerBg: string;
  headerText: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  mutedText: string;
  accent: string;
  danger: string;
  userBubble: string;
  assistantBubble: string;
};

export function getChatGptPalette(theme: ResolvedTheme): ChatGptPalette {
  if (theme === 'dark') {
    return {
      appBg: '#0f1115',
      headerBg: '#202123',
      headerText: '#ececf1',
      surface: '#17191f',
      surfaceAlt: '#20232b',
      border: '#2e3138',
      text: '#ececf1',
      mutedText: '#9ea2ad',
      accent: '#10a37f',
      danger: '#ef4444',
      userBubble: '#1f2937',
      assistantBubble: '#17191f',
    };
  }

  return {
    appBg: '#f7f7f8',
    headerBg: '#ffffff',
    headerText: '#111827',
    surface: '#ffffff',
    surfaceAlt: '#f0f2f5',
    border: '#e5e7eb',
    text: '#111827',
    mutedText: '#6b7280',
    accent: '#10a37f',
    danger: '#dc2626',
    userBubble: '#eff3f8',
    assistantBubble: '#ffffff',
  };
}
