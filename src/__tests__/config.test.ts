describe('VIEWER_BASE_URL fallback format', () => {
  const originalEnv = process.env.EXPO_PUBLIC_VIEWER_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EXPO_PUBLIC_VIEWER_URL;
    } else {
      process.env.EXPO_PUBLIC_VIEWER_URL = originalEnv;
    }
    jest.resetModules();
  });

  it('uses the correct "/trip" fallback format when env is not set', () => {
    delete process.env.EXPO_PUBLIC_VIEWER_URL;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { VIEWER_BASE_URL } = require('@/constants/config');
      expect(VIEWER_BASE_URL).toBe('linhtv.io.vn/trip');
    });
  });

  it('returns the env value when set', () => {
    process.env.EXPO_PUBLIC_VIEWER_URL = 'https://viewer.example.com/trip';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { VIEWER_BASE_URL } = require('@/constants/config');
      expect(VIEWER_BASE_URL).toBe('https://viewer.example.com/trip');
    });
  });
});
