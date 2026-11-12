/**
 * Helpers for detecting utility classes that would conflict with a theme
 * default.
 *
 * NativeWind resolves conflicting utilities by the order their rules appear in
 * the compiled stylesheet — NOT by the order classes appear in the className
 * string (see `specificityCompare` / `appearanceOrder` in
 * react-native-css-interop). Default palette colors such as `bg-white` and
 * `text-black` are emitted after custom/extended colors, so a default class
 * prepended by a component will silently win over e.g. `bg-brand` or
 * `text-brand`. The only reliable fix is to omit the default class entirely
 * when the caller supplies their own.
 */

/** Strip responsive/state variants, e.g. `dark:active:text-white` → `text-white`. */
function baseUtility(token: string): string {
  return token.slice(token.lastIndexOf(':') + 1);
}

/** True when className contains a background utility (`bg-brand`, `sm:bg-red-500`). */
export function hasBackgroundUtility(className?: string): boolean {
  return (
    className
      ?.split(/\s+/)
      .some((token) => baseUtility(token).startsWith('bg-')) ?? false
  );
}

/** `text-*` values that set size or alignment rather than color. */
const NON_COLOR_TEXT_UTILITIES = new Set([
  'xs',
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  '6xl',
  '7xl',
  '8xl',
  '9xl',
  'left',
  'center',
  'right',
  'justify',
  'start',
  'end',
  'ellipsis',
  'clip',
  'wrap',
  'nowrap',
  'balance',
  'pretty',
]);

/** Arbitrary length values, e.g. `text-[28px]` / `text-[length:1.2rem]`. */
const ARBITRARY_TEXT_SIZE =
  /^\[(?:length:|\d*\.?\d+(?:px|r?em|pt|pc|%|vw|vh|vmin|vmax))/;

/** True when className contains a text color utility (`text-brand`, `text-white/80`). */
export function hasTextColorUtility(className?: string): boolean {
  return (
    className?.split(/\s+/).some((token) => {
      const utility = baseUtility(token);
      if (!utility.startsWith('text-')) return false;

      const value = utility.slice('text-'.length);
      if (NON_COLOR_TEXT_UTILITIES.has(value)) return false;
      if (value.startsWith('[')) return !ARBITRARY_TEXT_SIZE.test(value);

      return true;
    }) ?? false
  );
}
