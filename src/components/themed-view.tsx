import { View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { hasBackgroundUtility } from '@/lib/nativewind-classes';

export type ThemedViewProps = ViewProps & {
  className?: string;
  type?: ThemeColor;
};

/** Map theme palette (src/constants/theme.ts) → Tailwind classes */
const THEME_COLOR_CLASS: Record<ThemeColor, string> = {
  text: '',
  background: 'bg-white dark:bg-black',
  backgroundElement: 'bg-[#F0F0F3] dark:bg-[#212225]',
  backgroundSelected: 'bg-[#E0E1E6] dark:bg-[#2E3135]',
  textSecondary: '',
};

export function ThemedView({
  className,
  style,
  type,
  ...otherProps
}: ThemedViewProps) {
  // Never add the theme background when the caller supplies their own — the
  // compiled stylesheet emits `bg-white` after custom colors, so it would win
  // over classes like `bg-brand` regardless of className order.
  const colorClass = hasBackgroundUtility(className)
    ? ''
    : THEME_COLOR_CLASS[type ?? 'background'];

  return (
    <View
      className={`${colorClass}${className ? ` ${className}` : ''}`}
      style={style}
      {...otherProps}
    />
  );
}
