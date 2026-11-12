import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { Dimensions, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const INITIAL_SCALE_FACTOR = Dimensions.get('screen').height / 90;
const DURATION = 600;

// Gradient là API riêng của React Native (experimental_backgroundImage),
// chưa có utility tương ứng nên giữ qua style prop.
const GRADIENT_STYLE = {
  experimental_backgroundImage: 'linear-gradient(180deg, #3C9FFE, #0274DF)',
};

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      transform: [{ scale: 1 }],
      opacity: 1,
    },
    20: {
      opacity: 1,
    },
    70: {
      opacity: 0,
      easing: Easing.elastic(0.7),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(0.7),
    },
  });

  const image = (
    <Image
      className="h-[71px] w-[76px]"
      source={require('@/assets/images/expo-logo.png')}
    />
  );

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      className="absolute inset-0 z-[1000] items-center justify-center bg-brand"
    >
      {image}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      className="absolute inset-0 z-[1000] items-center justify-center bg-brand"
    >
      {image}
    </View>
  );
}

const keyframe = new Keyframe({
  0: {
    transform: [{ scale: INITIAL_SCALE_FACTOR }],
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
  },
  40: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
    easing: Easing.elastic(0.7),
  },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '0deg' }],
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

export function AnimatedIcon() {
  return (
    <View className="z-[100] size-[128px] items-center justify-center">
      <Animated.View
        entering={glowKeyframe.duration(60 * 1000 * 4)}
        className="absolute size-[201px]"
      >
        <Image
          className="absolute size-[201px]"
          source={require('@/assets/images/logo-glow.png')}
        />
      </Animated.View>

      <Animated.View
        entering={keyframe.duration(DURATION)}
        className="absolute size-[128px] rounded-[40px]"
        style={GRADIENT_STYLE}
      />
      <Animated.View
        className="items-center justify-center"
        entering={logoKeyframe.duration(DURATION)}
      >
        <Image
          className="h-[71px] w-[76px]"
          source={require('@/assets/images/expo-logo.png')}
        />
      </Animated.View>
    </View>
  );
}
