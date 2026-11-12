import { render } from '@testing-library/react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// Regression: NativeWind resolves conflicting utilities by stylesheet order,
// where default palette colors (bg-white, text-black) are emitted AFTER custom
// colors. A default theme class must therefore be omitted when the caller
// supplies its own color class, otherwise `bg-brand` / `text-brand` render as
// white/black in production builds.

describe('ThemedView background classes', () => {
  it('drops the default background when a bg utility is provided', async () => {
    const { getByTestId } = await render(
      <ThemedView testID="view" className="bg-brand" />,
    );

    expect(getByTestId('view').props.className).not.toContain('bg-white');
    expect(getByTestId('view').props.className).toContain('bg-brand');
  });

  it('keeps the default background when no bg utility is provided', async () => {
    const { getByTestId } = await render(
      <ThemedView testID="view" className="flex-1" />,
    );

    expect(getByTestId('view').props.className).toContain('bg-white');
  });
});

describe('ThemedText color classes', () => {
  it('drops the default text color when a text color utility is provided', async () => {
    const { getByTestId } = await render(
      <ThemedText testID="text" className="text-brand">
        hi
      </ThemedText>,
    );

    expect(getByTestId('text').props.className).not.toContain('text-black');
    expect(getByTestId('text').props.className).toContain('text-brand');
  });

  it('keeps the default text color when only a font size is provided', async () => {
    const { getByTestId } = await render(
      <ThemedText testID="text" className="text-[28px]">
        hi
      </ThemedText>,
    );

    expect(getByTestId('text').props.className).toContain('text-black');
    expect(getByTestId('text').props.className).toContain('text-[28px]');
  });
});
