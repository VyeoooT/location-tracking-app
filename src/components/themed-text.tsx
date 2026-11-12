import { Text, type TextProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';

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
  return (
    <Text
      className={`${THEME_COLOR_CLASS[themeColor ?? 'text']} ${TYPE_CLASS[type]}${className ? ` ${className}` : ''}`}
      style={style}
      {...rest}
    />
  );
}
