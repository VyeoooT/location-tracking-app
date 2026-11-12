import { Text, type TextProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { hasTextColorUtility } from '@/lib/nativewind-classes';

export type ThemedTextProps = TextProps & {
  className?: string;
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

/** Map theme palette (src/constants/theme.ts) → Tailwind classes */
const THEME_COLOR_CLASS: Record<ThemeColor, string> = {
  text: 'text-black dark:text-white',
  background: '',
  backgroundElement: '',
  backgroundSelected: '',
  textSecondary: 'text-[#60646C] dark:text-[#B0B4BA]',
};

const TYPE_CLASS = {
  default: 'text-base leading-6 font-medium',
  title: 'text-5xl font-semibold leading-[52px]',
  small: 'text-sm leading-5 font-medium',
  smallBold: 'text-sm leading-5 font-bold',
  subtitle: 'text-[32px] leading-[44px] font-semibold',
  link: 'text-sm leading-[30px]',
  linkPrimary: 'text-sm leading-[30px] text-link',
  code: 'font-mono text-xs font-medium android:font-bold',
} as const;

export function ThemedText({
  className,
  style,
  type = 'default',
  themeColor,
  ...rest
}: ThemedTextProps) {
  // Skip the theme color when the caller passes a text color utility — in the
  // compiled stylesheet `text-black` is emitted after custom colors, so it
  // would otherwise override `text-brand` and friends.
  const themeClass = hasTextColorUtility(className)
    ? ''
    : THEME_COLOR_CLASS[themeColor ?? 'text'];

  return (
    <Text
      className={`${themeClass} ${TYPE_CLASS[type]}${className ? ` ${className}` : ''}`}
      style={style}
      {...rest}
    />
  );
}
